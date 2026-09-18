from __future__ import annotations

import argparse
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd


PIP = 0.0001
LOOKAHEAD_MINUTES = 60
COOLDOWN_MINUTES = 15
TARGET_STOP_PAIRS = ((3.0, 3.0), (5.0, 3.0), (5.0, 5.0))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Frequency-first EUR/USD M1 setup scan. "
            "Measures opportunity rate and cost-aware short-horizon outcomes."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument(
        "--audit-output",
        type=Path,
        default=None,
        help="Optional per-opportunity audit CSV.",
    )
    parser.add_argument(
        "--cooldown-minutes",
        type=int,
        default=COOLDOWN_MINUTES,
        help="Minimum gap between opportunities for the same setup/direction. Default: 15.",
    )
    return parser.parse_args()


def load_candles(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)

    required = {
        "time_iso",
        "bid_open", "bid_high", "bid_low", "bid_close",
        "ask_open", "ask_high", "ask_low", "ask_close",
        "mid_open", "mid_high", "mid_low", "mid_close",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"Missing required bid/ask columns: {sorted(missing)}. "
            "Re-export M1 data with the current exporter."
        )

    df["time_utc"] = pd.to_datetime(df["time_iso"], utc=True)
    df = df.sort_values("time_utc").reset_index(drop=True)

    # Research only. 2026 remains untouched.
    df = df[df["time_utc"] < pd.Timestamp("2026-01-01T00:00:00Z")].copy()
    df["year"] = df["time_utc"].dt.year
    df["date"] = df["time_utc"].dt.date
    df["hour_utc"] = df["time_utc"].dt.hour

    return df.reset_index(drop=True)


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    close = out["mid_close"]
    high = out["mid_high"]
    low = out["mid_low"]

    ema9 = close.ewm(span=9, adjust=False).mean()
    ema30 = close.ewm(span=30, adjust=False).mean()
    ema60 = close.ewm(span=60, adjust=False).mean()

    out["ema9"] = ema9
    out["ema30"] = ema30
    out["ema60"] = ema60

    out["ret_3m_pips"] = (close - close.shift(3)) / PIP
    out["ret_5m_pips"] = (close - close.shift(5)) / PIP
    out["ret_15m_pips"] = (close - close.shift(15)) / PIP

    prev_close = close.shift(1)
    true_range = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    out["atr14_pips"] = true_range.rolling(14).mean() / PIP

    prior_high15 = high.rolling(15).max().shift(1)
    prior_low15 = low.rolling(15).min().shift(1)

    out["micro_breakout_long"] = close > prior_high15
    out["micro_breakout_short"] = close < prior_low15

    out["pullback_reclaim_long"] = (
        (ema9 > ema30)
        & (close.shift(1) <= ema9.shift(1))
        & (close > ema9)
    )
    out["pullback_reclaim_short"] = (
        (ema9 < ema30)
        & (close.shift(1) >= ema9.shift(1))
        & (close < ema9)
    )

    out["momentum_burst_long"] = (
        (out["ret_5m_pips"] > 0)
        & (out["ret_5m_pips"] >= 1.25 * out["atr14_pips"])
        & (ema30 > ema60)
    )
    out["momentum_burst_short"] = (
        (out["ret_5m_pips"] < 0)
        & (-out["ret_5m_pips"] >= 1.25 * out["atr14_pips"])
        & (ema30 < ema60)
    )

    rolling_mean20 = close.rolling(20).mean()
    rolling_std20 = close.rolling(20).std()
    out["z20"] = (close - rolling_mean20) / rolling_std20

    out["mean_reversion_reclaim_long"] = (
        (out["z20"].shift(1) <= -1.5)
        & (out["z20"] > -1.5)
    )
    out["mean_reversion_reclaim_short"] = (
        (out["z20"].shift(1) >= 1.5)
        & (out["z20"] < 1.5)
    )

    return out


SETUPS = (
    ("micro_breakout_15m", "LONG", "micro_breakout_long"),
    ("micro_breakout_15m", "SHORT", "micro_breakout_short"),
    ("trend_pullback_reclaim", "LONG", "pullback_reclaim_long"),
    ("trend_pullback_reclaim", "SHORT", "pullback_reclaim_short"),
    ("momentum_burst_5m", "LONG", "momentum_burst_long"),
    ("momentum_burst_5m", "SHORT", "momentum_burst_short"),
    ("mean_reversion_reclaim", "LONG", "mean_reversion_reclaim_long"),
    ("mean_reversion_reclaim", "SHORT", "mean_reversion_reclaim_short"),
)


def event_indices(
    df: pd.DataFrame,
    mask: pd.Series,
    cooldown_minutes: int,
) -> list[int]:
    # Count a sustained condition once, on its transition from False -> True.
    transition = mask.fillna(False) & ~mask.fillna(False).shift(1, fill_value=False)

    accepted: list[int] = []
    next_allowed: pd.Timestamp | None = None
    cooldown = timedelta(minutes=cooldown_minutes)

    for idx in df.index[transition]:
        ts = df.at[idx, "time_utc"]
        if next_allowed is not None and ts < next_allowed:
            continue
        accepted.append(int(idx))
        next_allowed = ts + cooldown

    return accepted


def build_market_arrays(df: pd.DataFrame) -> dict[str, np.ndarray]:
    return {
        "time_ns": df["time_utc"].astype("int64").to_numpy(),
        "year": df["year"].to_numpy(),
        "date": df["date"].to_numpy(),
        "hour_utc": df["hour_utc"].to_numpy(),
        "bid_open": df["bid_open"].to_numpy(dtype=float),
        "bid_high": df["bid_high"].to_numpy(dtype=float),
        "bid_low": df["bid_low"].to_numpy(dtype=float),
        "ask_open": df["ask_open"].to_numpy(dtype=float),
        "ask_high": df["ask_high"].to_numpy(dtype=float),
        "ask_low": df["ask_low"].to_numpy(dtype=float),
    }


def first_hit_index(values: np.ndarray, threshold: float) -> int | None:
    hits = np.flatnonzero(values >= threshold)
    return int(hits[0]) if hits.size else None


def evaluate_path(
    arrays: dict[str, np.ndarray],
    signal_idx: int,
    direction: str,
) -> dict | None:
    entry_idx = signal_idx + 1
    total = len(arrays["time_ns"])
    if entry_idx >= total:
        return None

    signal_ns = int(arrays["time_ns"][signal_idx])
    entry_ns = int(arrays["time_ns"][entry_idx])

    # The next M1 bar must actually be the next minute.
    if entry_ns - signal_ns > 120 * 1_000_000_000:
        return None

    # Only the next 60 minutes can affect this study. Work directly on NumPy
    # arrays rather than constructing pandas objects for every signal.
    stop_idx = min(entry_idx + LOOKAHEAD_MINUTES + 1, total)
    future_times = arrays["time_ns"][entry_idx:stop_idx]
    end_ns = entry_ns + LOOKAHEAD_MINUTES * 60 * 1_000_000_000
    valid_count = int(np.searchsorted(future_times, end_ns, side="right"))

    if valid_count < LOOKAHEAD_MINUTES - 5:
        return None

    window_end = entry_idx + valid_count

    if direction == "LONG":
        entry = float(arrays["ask_open"][entry_idx])
        favourable = (
            arrays["bid_high"][entry_idx:window_end] - entry
        ) / PIP
        adverse = (
            entry - arrays["bid_low"][entry_idx:window_end]
        ) / PIP
    else:
        entry = float(arrays["bid_open"][entry_idx])
        favourable = (
            entry - arrays["ask_low"][entry_idx:window_end]
        ) / PIP
        adverse = (
            arrays["ask_high"][entry_idx:window_end] - entry
        ) / PIP

    result = {
        "signal_time_ns": signal_ns,
        "entry_time_ns": entry_ns,
        "direction": direction,
        "year": int(arrays["year"][entry_idx]),
        "date": arrays["date"][entry_idx],
        "hour_utc": int(arrays["hour_utc"][entry_idx]),
        "mfe_60m_pips": float(np.max(favourable)),
        "mae_60m_pips": float(np.max(adverse)),
    }

    for target, stop in TARGET_STOP_PAIRS:
        target_idx = first_hit_index(favourable, target)
        stop_idx_hit = first_hit_index(adverse, stop)

        if target_idx is None and stop_idx_hit is None:
            outcome = "NEITHER"
        elif target_idx is None:
            outcome = "STOP"
        elif stop_idx_hit is None:
            outcome = "TARGET"
        elif target_idx < stop_idx_hit:
            outcome = "TARGET"
        elif stop_idx_hit < target_idx:
            outcome = "STOP"
        else:
            outcome = "AMBIGUOUS"

        key = f"tp{int(target)}_sl{int(stop)}"
        result[f"{key}_outcome"] = outcome

    return result

def summarize(setup: str, direction: str, trades: pd.DataFrame) -> list[dict]:
    rows: list[dict] = []

    for period, subset in [
        ("all_2022_2025", trades),
        *[(str(year), trades[trades["year"] == year]) for year in (2022, 2023, 2024, 2025)],
    ]:
        if subset.empty:
            continue

        daily = subset.groupby("date").size()
        active_dates = pd.Series(
            pd.date_range(
                subset["entry_time_utc"].min().date(),
                subset["entry_time_utc"].max().date(),
                freq="B",
            ).date
        )
        daily_full = daily.reindex(active_dates, fill_value=0)

        row = {
            "period": period,
            "setup": setup,
            "direction": direction,
            "opportunities": len(subset),
            "mean_opportunities_per_weekday": round(float(daily_full.mean()), 3),
            "median_opportunities_per_weekday": round(float(daily_full.median()), 3),
            "weekdays_with_5plus_pct": round(float((daily_full >= 5).mean()), 4),
            "median_mfe_60m_pips": round(float(subset["mfe_60m_pips"].median()), 3),
            "median_mae_60m_pips": round(float(subset["mae_60m_pips"].median()), 3),
        }

        for target, stop in TARGET_STOP_PAIRS:
            key = f"tp{int(target)}_sl{int(stop)}"
            outcomes = subset[f"{key}_outcome"]
            decisive = outcomes.isin(["TARGET", "STOP"])
            decisive_count = int(decisive.sum())
            targets = int((outcomes == "TARGET").sum())
            stops = int((outcomes == "STOP").sum())

            row[f"{key}_decisive"] = decisive_count
            row[f"{key}_target_rate"] = (
                round(targets / decisive_count, 4) if decisive_count else ""
            )
            row[f"{key}_expectancy_after_spread_pips"] = (
                round((targets * target - stops * stop) / decisive_count, 4)
                if decisive_count
                else ""
            )

        rows.append(row)

    return rows


def main() -> None:
    args = parse_args()
    df = add_features(load_candles(args.input_csv))
    arrays = build_market_arrays(df)

    summaries: list[dict] = []
    audits: list[pd.DataFrame] = []

    for setup, direction, column in SETUPS:
        indices = event_indices(
            df,
            df[column],
            cooldown_minutes=args.cooldown_minutes,
        )

        print(
            f"Scanning {setup} {direction}: {len(indices)} candidate events..."
        )

        records: list[dict] = []
        for idx in indices:
            result = evaluate_path(arrays, idx, direction)
            if result is None:
                continue
            result["setup"] = setup
            records.append(result)

        if not records:
            continue

        trades = pd.DataFrame(records)
        trades["signal_time_utc"] = pd.to_datetime(
            trades.pop("signal_time_ns"), unit="ns", utc=True
        )
        trades["entry_time_utc"] = pd.to_datetime(
            trades.pop("entry_time_ns"), unit="ns", utc=True
        )
        audits.append(trades)
        summaries.extend(summarize(setup, direction, trades))

    output = pd.DataFrame(summaries)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output_csv, index=False)

    if args.audit_output and audits:
        args.audit_output.parent.mkdir(parents=True, exist_ok=True)
        pd.concat(audits, ignore_index=True).to_csv(args.audit_output, index=False)

    print(f"Wrote: {args.output_csv}")
    print("2026 holdout NOT evaluated.")
    print("")
    print("Frequency target: 5-10 eventual trades/day.")
    print("This scan measures opportunities, not a finished single-position strategy.")

    if not output.empty:
        aggregate = output[output["period"] == "all_2022_2025"].copy()
        columns = [
            "setup",
            "direction",
            "opportunities",
            "mean_opportunities_per_weekday",
            "weekdays_with_5plus_pct",
            "median_mfe_60m_pips",
            "median_mae_60m_pips",
            "tp3_sl3_target_rate",
            "tp3_sl3_expectancy_after_spread_pips",
            "tp5_sl3_target_rate",
            "tp5_sl3_expectancy_after_spread_pips",
            "tp5_sl5_target_rate",
            "tp5_sl5_expectancy_after_spread_pips",
        ]
        print("")
        print(aggregate[columns].to_string(index=False))


if __name__ == "__main__":
    main()
