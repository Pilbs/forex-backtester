from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd


PIP = 0.0001
LOOKAHEAD_MINUTES = 60
TARGET_STOP_PAIRS = ((3.0, 3.0), (5.0, 3.0), (5.0, 5.0))

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

    # Research only. Keep 2026 untouched.
    df = df[df["time_utc"] < pd.Timestamp("2026-01-01T00:00:00Z")].copy()
    df["year"] = df["time_utc"].dt.year
    df["date"] = df["time_utc"].dt.date
    df["hour_utc"] = df["time_utc"].dt.hour

    return df.reset_index(drop=True)


def _session_bucket(time_utc: pd.Series) -> pd.Series:
    london = time_utc.dt.tz_convert("Europe/London")
    new_york = time_utc.dt.tz_convert("America/New_York")

    london_hour = london.dt.hour
    ny_hour = new_york.dt.hour
    utc_hour = time_utc.dt.hour

    overlap = london_hour.between(12, 16) & ny_hour.between(8, 12)
    london_morning = london_hour.between(7, 11)
    ny_only = ny_hour.between(8, 12)
    asia = utc_hour.between(0, 6)

    conditions = [
        overlap,
        london_morning,
        ny_only,
        asia,
    ]
    choices = [
        "LONDON_NY_OVERLAP",
        "LONDON_MORNING",
        "NY_MORNING",
        "ASIA",
    ]

    return pd.Series(
        np.select(conditions, choices, default="OTHER"),
        index=time_utc.index,
    )


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
    out["ret_30m_pips"] = (close - close.shift(30)) / PIP

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

    # Relative volatility uses only previously known history for the reference.
    trailing_atr_median = (
        out["atr14_pips"]
        .rolling(240, min_periods=60)
        .median()
        .shift(1)
    )
    out["atr_relative"] = out["atr14_pips"] / trailing_atr_median
    out["volatility_context"] = pd.cut(
        out["atr_relative"],
        bins=[-np.inf, 0.8, 1.2, np.inf],
        labels=["LOW", "NORMAL", "HIGH"],
    ).astype("object")

    out["session_context"] = _session_bucket(out["time_utc"])

    range_high30 = high.rolling(30).max()
    range_low30 = low.rolling(30).min()
    range_width30 = range_high30 - range_low30
    out["range_position_30"] = (
        (close - range_low30) / range_width30.replace(0, np.nan)
    )

    out["ret_5m_atr"] = out["ret_5m_pips"] / out["atr14_pips"]
    out["ret_15m_atr"] = out["ret_15m_pips"] / out["atr14_pips"]
    out["ret_30m_atr"] = out["ret_30m_pips"] / out["atr14_pips"]
    out["ema9_30_atr"] = ((ema9 - ema30) / PIP) / out["atr14_pips"]
    out["body_atr"] = ((close - out["mid_open"]) / PIP) / out["atr14_pips"]
    out["spread_pips"] = (out["ask_close"] - out["bid_close"]) / PIP

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


def directional_context(df: pd.DataFrame, direction: str) -> pd.Series:
    sign = 1.0 if direction == "LONG" else -1.0
    signed_move = sign * df["ret_15m_pips"]
    threshold = df["atr14_pips"]

    return pd.Series(
        np.select(
            [
                signed_move >= threshold,
                signed_move <= -threshold,
            ],
            [
                "ALIGNED",
                "OPPOSED",
            ],
            default="NEUTRAL",
        ),
        index=df.index,
    )


def event_indices(
    df: pd.DataFrame,
    mask: pd.Series,
    cooldown_minutes: int,
) -> list[int]:
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


def _first_hit_index(values: np.ndarray, threshold: float) -> int | None:
    hits = np.flatnonzero(values >= threshold)
    return int(hits[0]) if hits.size else None


def evaluate_path(
    arrays: dict[str, np.ndarray],
    signal_idx: int,
    direction: str,
    lookahead_minutes: int = LOOKAHEAD_MINUTES,
) -> dict | None:
    entry_idx = signal_idx + 1
    total = len(arrays["time_ns"])
    if entry_idx >= total:
        return None

    signal_ns = int(arrays["time_ns"][signal_idx])
    entry_ns = int(arrays["time_ns"][entry_idx])

    if entry_ns - signal_ns > 120 * 1_000_000_000:
        return None

    stop_idx = min(entry_idx + lookahead_minutes + 1, total)
    future_times = arrays["time_ns"][entry_idx:stop_idx]
    end_ns = entry_ns + lookahead_minutes * 60 * 1_000_000_000
    valid_count = int(np.searchsorted(future_times, end_ns, side="right"))

    if valid_count < max(1, lookahead_minutes - 5):
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
        "mfe_pips": float(np.max(favourable)),
        "mae_pips": float(np.max(adverse)),
    }

    for target, stop in TARGET_STOP_PAIRS:
        target_idx = _first_hit_index(favourable, target)
        stop_idx_hit = _first_hit_index(adverse, stop)

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



def evaluate_forward_returns(
    arrays: dict[str, np.ndarray],
    signal_idx: int,
    direction: str,
    horizons: tuple[int, ...] = (5, 10, 15, 30),
) -> dict[str, float] | None:
    entry_idx = signal_idx + 1
    total = len(arrays["time_ns"])
    if entry_idx >= total:
        return None

    signal_ns = int(arrays["time_ns"][signal_idx])
    entry_ns = int(arrays["time_ns"][entry_idx])
    if entry_ns - signal_ns > 120 * 1_000_000_000:
        return None

    result: dict[str, float] = {}

    for minutes in horizons:
        exit_idx = entry_idx + minutes
        if exit_idx >= total:
            return None

        exit_ns = int(arrays["time_ns"][exit_idx])
        elapsed_minutes = (exit_ns - entry_ns) / 60_000_000_000
        if elapsed_minutes > minutes + 2:
            return None

        if direction == "LONG":
            entry = float(arrays["ask_open"][entry_idx])
            exit_price = float(arrays["bid_open"][exit_idx])
            move = (exit_price - entry) / PIP
        else:
            entry = float(arrays["bid_open"][entry_idx])
            exit_price = float(arrays["ask_open"][exit_idx])
            move = (entry - exit_price) / PIP

        result[f"net_{minutes}m_pips"] = float(move)

    return result

def finalize_trade_frame(records: list[dict]) -> pd.DataFrame:
    trades = pd.DataFrame(records)
    if trades.empty:
        return trades

    trades["signal_time_utc"] = pd.to_datetime(
        trades.pop("signal_time_ns"), unit="ns", utc=True
    )
    trades["entry_time_utc"] = pd.to_datetime(
        trades.pop("entry_time_ns"), unit="ns", utc=True
    )
    return trades
