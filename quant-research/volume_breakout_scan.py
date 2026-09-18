from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from common.intraday import PIP, _session_bucket, load_candles
from common.research_run import make_run_dir, write_manifest


DEVELOPMENT_START = pd.Timestamp("2022-01-01T00:00:00Z")
DEVELOPMENT_END = pd.Timestamp("2024-12-31T23:59:59Z")
VALIDATION_START = pd.Timestamp("2025-01-01T00:00:00Z")
VALIDATION_END = pd.Timestamp("2025-12-31T23:59:59Z")

DEFAULT_TIMEFRAMES = ("M1", "M5", "M15")
DEFAULT_LOOKBACKS = (5, 10, 20)
DEFAULT_VOLUME_RATIOS = (1.0, 1.25, 1.5, 2.0)
DEFAULT_VOLUME_LOOKBACK = 20
DEFAULT_MAX_SPREAD_PIPS = 1.5
DEFAULT_SESSIONS = ("LONDON_MORNING", "LONDON_NY_OVERLAP", "NY_MORNING")
HORIZON_MINUTES = (15, 30, 60)


@dataclass(frozen=True)
class Config:
    timeframe: str
    breakout_lookback_bars: int
    volume_lookback_bars: int
    minimum_volume_ratio: float
    max_spread_pips: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Volume-confirmed breakout discovery scan. "
            "Uses 2022-2024 for development, 2025 for validation and never evaluates 2026."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("quant-research/outputs"),
    )
    parser.add_argument("--instrument", default="EUR_USD")
    parser.add_argument("--data-label", default="2022-2025")
    parser.add_argument(
        "--timeframes",
        nargs="+",
        choices=["M1", "M5", "M15"],
        default=list(DEFAULT_TIMEFRAMES),
    )
    parser.add_argument(
        "--lookbacks",
        nargs="+",
        type=int,
        default=list(DEFAULT_LOOKBACKS),
    )
    parser.add_argument(
        "--volume-ratios",
        nargs="+",
        type=float,
        default=list(DEFAULT_VOLUME_RATIOS),
    )
    parser.add_argument(
        "--volume-lookback",
        type=int,
        default=DEFAULT_VOLUME_LOOKBACK,
    )
    parser.add_argument(
        "--max-spread-pips",
        type=float,
        default=DEFAULT_MAX_SPREAD_PIPS,
    )
    parser.add_argument(
        "--sessions",
        nargs="+",
        default=list(DEFAULT_SESSIONS),
    )
    return parser.parse_args()


def timeframe_minutes(timeframe: str) -> int:
    return int(timeframe[1:])


def resample_candles(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    minutes = timeframe_minutes(timeframe)
    if minutes == 1:
        out = df.copy()
    else:
        source = df.set_index("time_utc")
        rule = f"{minutes}min"
        agg = {
            "volume": "sum",
            "bid_open": "first",
            "bid_high": "max",
            "bid_low": "min",
            "bid_close": "last",
            "ask_open": "first",
            "ask_high": "max",
            "ask_low": "min",
            "ask_close": "last",
            "mid_open": "first",
            "mid_high": "max",
            "mid_low": "min",
            "mid_close": "last",
        }
        out = source.resample(rule, label="left", closed="left").agg(agg)
        out = out.dropna(subset=["bid_open", "ask_open", "mid_open"]).reset_index()

    out = out.sort_values("time_utc").reset_index(drop=True)
    out["year"] = out["time_utc"].dt.year
    out["date"] = out["time_utc"].dt.date
    out["session_context"] = _session_bucket(out["time_utc"])
    out["spread_pips"] = (out["ask_close"] - out["bid_close"]) / PIP
    return out


def add_signal_features(
    df: pd.DataFrame,
    breakout_lookback_bars: int,
    volume_lookback_bars: int,
) -> pd.DataFrame:
    out = df.copy()

    prior_high = (
        out["mid_high"]
        .rolling(breakout_lookback_bars, min_periods=breakout_lookback_bars)
        .max()
        .shift(1)
    )
    prior_low = (
        out["mid_low"]
        .rolling(breakout_lookback_bars, min_periods=breakout_lookback_bars)
        .min()
        .shift(1)
    )
    baseline_volume = (
        out["volume"]
        .rolling(volume_lookback_bars, min_periods=volume_lookback_bars)
        .mean()
        .shift(1)
    )

    out["volume_baseline"] = baseline_volume
    out["volume_ratio"] = out["volume"] / baseline_volume.replace(0, np.nan)
    out["breakout_long"] = out["mid_close"] > prior_high
    out["breakout_short"] = out["mid_close"] < prior_low
    return out


def evaluate_signal(
    df: pd.DataFrame,
    idx: int,
    direction: str,
    timeframe: str,
) -> dict | None:
    entry_idx = idx + 1
    if entry_idx >= len(df):
        return None

    step_minutes = timeframe_minutes(timeframe)
    if direction == "LONG":
        entry_price = float(df.at[entry_idx, "ask_open"])
    else:
        entry_price = float(df.at[entry_idx, "bid_open"])

    result = {
        "entry_time_utc": df.at[entry_idx, "time_utc"],
        "entry_price": entry_price,
    }

    for horizon in HORIZON_MINUTES:
        bars = max(1, int(np.ceil(horizon / step_minutes)))
        exit_idx = entry_idx + bars - 1
        if exit_idx >= len(df):
            return None

        if direction == "LONG":
            exit_price = float(df.at[exit_idx, "bid_close"])
            net_pips = (exit_price - entry_price) / PIP
        else:
            exit_price = float(df.at[exit_idx, "ask_close"])
            net_pips = (entry_price - exit_price) / PIP

        result[f"net_{horizon}m_pips"] = net_pips

    return result


def signal_records(
    df: pd.DataFrame,
    config: Config,
    allowed_sessions: set[str],
) -> list[dict]:
    featured = add_signal_features(
        df,
        config.breakout_lookback_bars,
        config.volume_lookback_bars,
    )

    common = (
        featured["session_context"].isin(allowed_sessions)
        & featured["volume_ratio"].ge(config.minimum_volume_ratio)
        & featured["spread_pips"].le(config.max_spread_pips)
    )

    records: list[dict] = []
    for direction, column in (
        ("LONG", "breakout_long"),
        ("SHORT", "breakout_short"),
    ):
        # Count only the onset of a breakout condition, not every candle that remains beyond the level.
        raw = featured[column].fillna(False)
        onset = raw & ~raw.shift(1, fill_value=False)
        indices = featured.index[common & onset]

        for idx in indices:
            outcome = evaluate_signal(featured, int(idx), direction, config.timeframe)
            if outcome is None:
                continue

            records.append(
                {
                    "timeframe": config.timeframe,
                    "breakout_lookback_bars": config.breakout_lookback_bars,
                    "volume_lookback_bars": config.volume_lookback_bars,
                    "minimum_volume_ratio": config.minimum_volume_ratio,
                    "max_spread_pips": config.max_spread_pips,
                    "direction": direction,
                    "signal_time_utc": featured.at[idx, "time_utc"],
                    "session": featured.at[idx, "session_context"],
                    "signal_volume": float(featured.at[idx, "volume"]),
                    "volume_baseline": float(featured.at[idx, "volume_baseline"]),
                    "volume_ratio": float(featured.at[idx, "volume_ratio"]),
                    "spread_pips": float(featured.at[idx, "spread_pips"]),
                    **outcome,
                }
            )

    return records


def business_days(start: pd.Timestamp, end: pd.Timestamp) -> int:
    return len(pd.date_range(start.date(), end.date(), freq="B"))


def summarize_period(
    signals: pd.DataFrame,
    period_name: str,
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> list[dict]:
    subset = signals[
        (signals["signal_time_utc"] >= start)
        & (signals["signal_time_utc"] <= end)
    ]

    group_cols = [
        "timeframe",
        "breakout_lookback_bars",
        "volume_lookback_bars",
        "minimum_volume_ratio",
        "max_spread_pips",
    ]
    days = business_days(start, end)
    rows: list[dict] = []

    for keys, group in subset.groupby(group_cols, sort=True):
        row = dict(zip(group_cols, keys))
        row["period"] = period_name
        row["signals"] = len(group)
        row["signals_per_weekday"] = len(group) / days
        for horizon in HORIZON_MINUTES:
            col = f"net_{horizon}m_pips"
            row[f"mean_net_{horizon}m_pips"] = float(group[col].mean())
            row[f"median_net_{horizon}m_pips"] = float(group[col].median())
            row[f"positive_{horizon}m_rate"] = float((group[col] > 0).mean())
        rows.append(row)

    return rows


def build_summary(signals: pd.DataFrame) -> pd.DataFrame:
    rows = []
    rows.extend(
        summarize_period(
            signals,
            "development_2022_2024",
            DEVELOPMENT_START,
            DEVELOPMENT_END,
        )
    )
    rows.extend(
        summarize_period(
            signals,
            "validation_2025",
            VALIDATION_START,
            VALIDATION_END,
        )
    )
    return pd.DataFrame(rows)


def create_overview(summary: pd.DataFrame, path: Path) -> None:
    dev = summary[summary["period"] == "development_2022_2024"].copy()
    val = summary[summary["period"] == "validation_2025"].copy()

    keys = [
        "timeframe",
        "breakout_lookback_bars",
        "volume_lookback_bars",
        "minimum_volume_ratio",
        "max_spread_pips",
    ]
    paired = dev.merge(val, on=keys, suffixes=("_dev", "_2025"))
    if paired.empty:
        return

    paired["label"] = (
        paired["timeframe"]
        + " L"
        + paired["breakout_lookback_bars"].astype(str)
        + " V"
        + paired["minimum_volume_ratio"].map(lambda x: f"{x:g}")
    )
    paired = paired.sort_values(
        ["mean_net_30m_pips_dev", "signals_per_weekday_dev"],
        ascending=[False, False],
    ).head(18)

    fig, ax = plt.subplots(figsize=(12, 7))
    x = np.arange(len(paired))
    width = 0.38
    ax.bar(
        x - width / 2,
        paired["mean_net_30m_pips_dev"],
        width,
        label="2022-2024 development",
    )
    ax.bar(
        x + width / 2,
        paired["mean_net_30m_pips_2025"],
        width,
        label="2025 validation",
    )
    ax.axhline(0, linewidth=1)
    ax.set_title("Volume-confirmed breakout: mean net 30-minute outcome")
    ax.set_ylabel("Net pips after bid/ask execution")
    ax.set_xticks(x)
    ax.set_xticklabels(paired["label"], rotation=55, ha="right")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def create_frequency_chart(summary: pd.DataFrame, path: Path) -> None:
    dev = summary[summary["period"] == "development_2022_2024"].copy()
    if dev.empty:
        return

    grouped = (
        dev.groupby(["timeframe", "minimum_volume_ratio"], as_index=False)
        ["signals_per_weekday"]
        .mean()
        .sort_values(["timeframe", "minimum_volume_ratio"])
    )

    fig, ax = plt.subplots(figsize=(10, 6))
    for timeframe, part in grouped.groupby("timeframe", sort=True):
        ax.plot(
            part["minimum_volume_ratio"],
            part["signals_per_weekday"],
            marker="o",
            label=timeframe,
        )
    ax.set_title("Signal frequency as volume confirmation tightens")
    ax.set_xlabel("Minimum current-volume / trailing-volume ratio")
    ax.set_ylabel("Mean signals per weekday")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> None:
    args = parse_args()
    base = load_candles(args.input_csv)

    if "volume" not in base.columns:
        raise ValueError(
            "Input CSV has no volume column. Re-export candles with the current exporter."
        )

    configs = [
        Config(
            timeframe=timeframe,
            breakout_lookback_bars=lookback,
            volume_lookback_bars=args.volume_lookback,
            minimum_volume_ratio=ratio,
            max_spread_pips=args.max_spread_pips,
        )
        for timeframe in args.timeframes
        for lookback in args.lookbacks
        for ratio in args.volume_ratios
    ]

    frames = {
        timeframe: resample_candles(base, timeframe)
        for timeframe in args.timeframes
    }
    allowed_sessions = set(args.sessions)

    records: list[dict] = []
    for config in configs:
        print(
            f"Testing {config.timeframe} breakout={config.breakout_lookback_bars} "
            f"volume>={config.minimum_volume_ratio:g}x..."
        )
        records.extend(
            signal_records(frames[config.timeframe], config, allowed_sessions)
        )

    signals = pd.DataFrame(records)
    if signals.empty:
        raise RuntimeError("No volume-confirmed breakout signals were produced.")

    signals["signal_time_utc"] = pd.to_datetime(signals["signal_time_utc"], utc=True)
    signals["entry_time_utc"] = pd.to_datetime(signals["entry_time_utc"], utc=True)
    summary = build_summary(signals)

    run_id, run_dir = make_run_dir(
        args.output_root,
        "volume_breakout",
        args.instrument,
        args.data_label,
    )

    summary_path = run_dir / "summary.csv"
    signals_path = run_dir / "signals.csv"
    overview_path = run_dir / "overview.png"
    frequency_path = run_dir / "frequency.png"

    summary.to_csv(summary_path, index=False)
    signals.to_csv(signals_path, index=False)
    create_overview(summary, overview_path)
    create_frequency_chart(summary, frequency_path)

    write_manifest(
        run_dir,
        {
            "run_id": run_id,
            "study": "volume_breakout",
            "hypothesis": (
                "A recent-range breakout has better short-horizon outcomes when "
                "current tick volume is elevated versus its trailing baseline."
            ),
            "input_csv": args.input_csv,
            "instrument": args.instrument,
            "data_label": args.data_label,
            "research_split": {
                "development": "2022-01-01 through 2024-12-31",
                "validation": "2025-01-01 through 2025-12-31",
                "holdout": "2026 - not evaluated",
            },
            "timeframes": args.timeframes,
            "breakout_lookbacks_bars": args.lookbacks,
            "volume_lookback_bars": args.volume_lookback,
            "minimum_volume_ratios": args.volume_ratios,
            "max_spread_pips": args.max_spread_pips,
            "sessions": args.sessions,
            "execution_model": (
                "Signal on completed candle; enter next candle at ask open for LONG "
                "or bid open for SHORT; exit at executable opposite-side close."
            ),
            "outputs": {
                "summary": summary_path,
                "signals": signals_path,
                "overview_chart": overview_path,
                "frequency_chart": frequency_path,
            },
        },
    )

    print("")
    print(f"Run: {run_id}")
    print(f"Folder: {run_dir}")
    print(f"Summary: {summary_path}")
    print(f"Signals: {signals_path}")
    print(f"Visuals: {overview_path.name}, {frequency_path.name}")
    print("2026 holdout NOT evaluated.")


if __name__ == "__main__":
    main()
