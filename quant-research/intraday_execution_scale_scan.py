from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

from common.intraday import PIP, add_features, build_market_arrays, load_candles


DEVELOPMENT_START = pd.Timestamp("2022-01-01T00:00:00Z")
DEVELOPMENT_END = pd.Timestamp("2024-12-31T23:59:59Z")
VALIDATION_START = pd.Timestamp("2025-01-01T00:00:00Z")
VALIDATION_END = pd.Timestamp("2025-12-31T23:59:59Z")

LIQUID_SESSIONS = ("LONDON_MORNING", "LONDON_NY_OVERLAP")
SAMPLE_EVERY_MINUTES = 5

TARGETS = (3.0, 5.0, 8.0, 10.0, 12.0, 15.0)
STOPS = (3.0, 5.0, 8.0, 10.0)
HORIZONS = (15, 30, 60, 120)

PERIODS = (
    ("development_2022_2024", DEVELOPMENT_START, DEVELOPMENT_END),
    ("validation_2025", VALIDATION_START, VALIDATION_END),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Execution-scale diagnostic for EUR/USD liquid sessions. "
            "Tests fixed TP/SL/horizon combinations on a 5-minute grid "
            "using real bid/ask candles; it is not a strategy optimizer."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    return parser.parse_args()


def period_for(ts: pd.Timestamp) -> str | None:
    if DEVELOPMENT_START <= ts <= DEVELOPMENT_END:
        return "development_2022_2024"
    if VALIDATION_START <= ts <= VALIDATION_END:
        return "validation_2025"
    return None


def first_hit(values: np.ndarray, threshold: float) -> int | None:
    hits = np.flatnonzero(values >= threshold)
    return int(hits[0]) if hits.size else None


def make_accumulator() -> dict[str, float]:
    return {
        "observations": 0,
        "targets": 0,
        "stops": 0,
        "ambiguous": 0,
        "neither": 0,
        "pnl_sum": 0.0,
        "spread_sum": 0.0,
    }


def add_result(
    acc: dict[str, float],
    outcome: str,
    pnl: float,
    spread: float,
) -> None:
    acc["observations"] += 1
    acc["pnl_sum"] += pnl
    acc["spread_sum"] += spread

    if outcome == "TARGET":
        acc["targets"] += 1
    elif outcome == "STOP":
        acc["stops"] += 1
    elif outcome == "AMBIGUOUS":
        acc["ambiguous"] += 1
    else:
        acc["neither"] += 1


def evaluate_sample(
    arrays: dict[str, np.ndarray],
    idx: int,
    direction: str,
) -> dict[int, dict[str, object]] | None:
    entry_idx = idx + 1
    total = len(arrays["time_ns"])
    if entry_idx >= total:
        return None

    signal_ns = int(arrays["time_ns"][idx])
    entry_ns = int(arrays["time_ns"][entry_idx])

    # Require a genuine next-minute entry.
    if entry_ns - signal_ns > 120 * 1_000_000_000:
        return None

    max_horizon = max(HORIZONS)
    stop_idx = min(entry_idx + max_horizon + 1, total)
    future_times = arrays["time_ns"][entry_idx:stop_idx]
    max_end_ns = entry_ns + max_horizon * 60 * 1_000_000_000
    valid_count = int(np.searchsorted(future_times, max_end_ns, side="right"))

    if valid_count < max_horizon - 5:
        return None

    window_end = entry_idx + valid_count
    spread = (
        float(arrays["ask_open"][entry_idx])
        - float(arrays["bid_open"][entry_idx])
    ) / PIP

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

    result: dict[int, dict[str, object]] = {}

    for horizon in HORIZONS:
        exit_idx = entry_idx + horizon
        if exit_idx >= total:
            continue

        exit_ns = int(arrays["time_ns"][exit_idx])
        elapsed = (exit_ns - entry_ns) / 60_000_000_000
        if elapsed > horizon + 2:
            continue

        count = int(
            np.searchsorted(
                arrays["time_ns"][entry_idx:window_end],
                entry_ns + horizon * 60 * 1_000_000_000,
                side="right",
            )
        )
        if count < max(1, horizon - 5):
            continue

        if direction == "LONG":
            terminal = (
                float(arrays["bid_open"][exit_idx]) - entry
            ) / PIP
        else:
            terminal = (
                entry - float(arrays["ask_open"][exit_idx])
            ) / PIP

        fav = favourable[:count]
        adv = adverse[:count]

        target_hits = {
            target: first_hit(fav, target)
            for target in TARGETS
        }
        stop_hits = {
            stop: first_hit(adv, stop)
            for stop in STOPS
        }

        result[horizon] = {
            "terminal": float(terminal),
            "spread": float(spread),
            "target_hits": target_hits,
            "stop_hits": stop_hits,
        }

    return result


def build_scan(df: pd.DataFrame) -> pd.DataFrame:
    arrays = build_market_arrays(df)

    mask = (
        df["session_context"].isin(LIQUID_SESSIONS)
        & (df["time_utc"].dt.minute % SAMPLE_EVERY_MINUTES == 0)
        & (df["time_utc"] >= DEVELOPMENT_START)
        & (df["time_utc"] <= VALIDATION_END)
    )
    indices = df.index[mask].to_numpy(dtype=int)

    grouped: dict[
        tuple[str, str, str, int, float, float],
        dict[str, float],
    ] = defaultdict(make_accumulator)

    print(f"Fixed-grid market states: {len(indices)}")

    for n, idx in enumerate(indices, start=1):
        if n % 25000 == 0:
            print(f"Evaluated {n}/{len(indices)} states...")

        ts = pd.Timestamp(df.at[idx, "time_utc"])
        period = period_for(ts)
        if period is None:
            continue

        session = str(df.at[idx, "session_context"])

        for direction in ("LONG", "SHORT"):
            paths = evaluate_sample(arrays, int(idx), direction)
            if not paths:
                continue

            for horizon, path in paths.items():
                terminal = float(path["terminal"])
                spread = float(path["spread"])
                target_hits = path["target_hits"]
                stop_hits = path["stop_hits"]

                for target in TARGETS:
                    target_idx = target_hits[target]

                    for stop in STOPS:
                        stop_idx = stop_hits[stop]

                        if target_idx is None and stop_idx is None:
                            outcome = "NEITHER"
                            pnl = terminal
                        elif target_idx is None:
                            outcome = "STOP"
                            pnl = -stop
                        elif stop_idx is None:
                            outcome = "TARGET"
                            pnl = target
                        elif target_idx < stop_idx:
                            outcome = "TARGET"
                            pnl = target
                        elif stop_idx < target_idx:
                            outcome = "STOP"
                            pnl = -stop
                        else:
                            # Both crossed inside the same M1 candle. Be conservative.
                            outcome = "AMBIGUOUS"
                            pnl = -stop

                        key = (
                            period,
                            session,
                            direction,
                            horizon,
                            target,
                            stop,
                        )
                        add_result(grouped[key], outcome, pnl, spread)

    rows: list[dict] = []

    for key, acc in grouped.items():
        period, session, direction, horizon, target, stop = key
        observations = int(acc["observations"])
        targets = int(acc["targets"])
        stops = int(acc["stops"])
        ambiguous = int(acc["ambiguous"])
        neither = int(acc["neither"])
        decisive = targets + stops

        observed_decisive_win_rate = (
            targets / decisive if decisive else np.nan
        )
        breakeven_win_rate = stop / (target + stop)
        mean_spread = acc["spread_sum"] / observations

        rows.append(
            {
                "period": period,
                "session": session,
                "direction": direction,
                "horizon_minutes": horizon,
                "target_pips": target,
                "stop_pips": stop,
                "observations": observations,
                "targets": targets,
                "stops": stops,
                "ambiguous": ambiguous,
                "neither": neither,
                "decisive_rate": round(decisive / observations, 4),
                "observed_decisive_win_rate": (
                    round(observed_decisive_win_rate, 4)
                    if decisive
                    else ""
                ),
                "breakeven_decisive_win_rate": round(breakeven_win_rate, 4),
                "win_rate_gap": (
                    round(observed_decisive_win_rate - breakeven_win_rate, 4)
                    if decisive
                    else ""
                ),
                "conservative_expectancy_pips": round(
                    acc["pnl_sum"] / observations,
                    4,
                ),
                "mean_entry_spread_pips": round(mean_spread, 4),
                "spread_as_pct_of_target": round(
                    100.0 * mean_spread / target,
                    2,
                ),
            }
        )

    return pd.DataFrame(rows)


def aggregate_liquid_sessions(output: pd.DataFrame) -> pd.DataFrame:
    grouped = (
        output.groupby(
            [
                "period",
                "horizon_minutes",
                "target_pips",
                "stop_pips",
            ],
            as_index=False,
        )
        .agg(
            observations=("observations", "sum"),
            targets=("targets", "sum"),
            stops=("stops", "sum"),
            ambiguous=("ambiguous", "sum"),
            neither=("neither", "sum"),
        )
    )

    # Recover weighted expectancy and spread from the detailed rows.
    detail = output.copy()
    detail["pnl_total"] = (
        detail["conservative_expectancy_pips"] * detail["observations"]
    )
    detail["spread_total"] = (
        detail["mean_entry_spread_pips"] * detail["observations"]
    )

    weights = (
        detail.groupby(
            [
                "period",
                "horizon_minutes",
                "target_pips",
                "stop_pips",
            ],
            as_index=False,
        )
        .agg(
            pnl_total=("pnl_total", "sum"),
            spread_total=("spread_total", "sum"),
        )
    )

    grouped = grouped.merge(
        weights,
        on=[
            "period",
            "horizon_minutes",
            "target_pips",
            "stop_pips",
        ],
        how="left",
    )

    grouped["decisive"] = grouped["targets"] + grouped["stops"]
    grouped["observed_decisive_win_rate"] = (
        grouped["targets"] / grouped["decisive"]
    )
    grouped["breakeven_decisive_win_rate"] = (
        grouped["stop_pips"]
        / (grouped["target_pips"] + grouped["stop_pips"])
    )
    grouped["win_rate_gap"] = (
        grouped["observed_decisive_win_rate"]
        - grouped["breakeven_decisive_win_rate"]
    )
    grouped["decisive_rate"] = grouped["decisive"] / grouped["observations"]
    grouped["conservative_expectancy_pips"] = (
        grouped["pnl_total"] / grouped["observations"]
    )
    grouped["mean_entry_spread_pips"] = (
        grouped["spread_total"] / grouped["observations"]
    )
    grouped["spread_as_pct_of_target"] = (
        100.0
        * grouped["mean_entry_spread_pips"]
        / grouped["target_pips"]
    )

    return grouped


def print_scale_ladder(output: pd.DataFrame) -> None:
    agg = aggregate_liquid_sessions(output)

    ladder = (
        (3.0, 3.0),
        (5.0, 5.0),
        (8.0, 8.0),
        (10.0, 10.0),
        (12.0, 10.0),
        (15.0, 10.0),
    )

    selected = pd.concat(
        [
            agg[
                (agg["target_pips"] == target)
                & (agg["stop_pips"] == stop)
                & (agg["horizon_minutes"].isin((30, 60, 120)))
            ]
            for target, stop in ladder
        ],
        ignore_index=True,
    )

    dev = selected[
        selected["period"] == "development_2022_2024"
    ]
    val = selected[
        selected["period"] == "validation_2025"
    ]

    paired = dev.merge(
        val,
        on=["horizon_minutes", "target_pips", "stop_pips"],
        suffixes=("_dev", "_2025"),
        how="left",
    ).sort_values(
        ["target_pips", "horizon_minutes"]
    )

    cols = [
        "target_pips",
        "stop_pips",
        "horizon_minutes",
        "spread_as_pct_of_target_dev",
        "decisive_rate_dev",
        "observed_decisive_win_rate_dev",
        "breakeven_decisive_win_rate_dev",
        "conservative_expectancy_pips_dev",
        "decisive_rate_2025",
        "observed_decisive_win_rate_2025",
        "conservative_expectancy_pips_2025",
    ]

    for col in cols:
        if col in paired.columns and col not in {
            "target_pips",
            "stop_pips",
            "horizon_minutes",
        }:
            paired[col] = pd.to_numeric(paired[col], errors="coerce").round(4)

    print("")
    print("Execution-scale ladder across both liquid sessions/directions:")
    print(paired[cols].to_string(index=False))


def main() -> None:
    args = parse_args()

    df = add_features(load_candles(args.input_csv))
    output = build_scan(df)

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output_csv, index=False)

    print(f"Wrote: {args.output_csv}")
    print("2026 holdout NOT evaluated.")
    print(
        "This is an execution-scale diagnostic over fixed market samples, "
        "not a strategy backtest."
    )

    if not output.empty:
        print_scale_ladder(output)


if __name__ == "__main__":
    main()
