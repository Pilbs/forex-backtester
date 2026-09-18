from __future__ import annotations

import argparse
from datetime import timedelta
from pathlib import Path

import pandas as pd

from common.intraday import (
    SETUPS,
    add_features,
    add_structure_features,
    build_market_arrays,
    evaluate_forward_returns,
    load_candles,
)


DEVELOPMENT_START = pd.Timestamp("2022-01-01T00:00:00Z")
DEVELOPMENT_END = pd.Timestamp("2024-12-31T23:59:59Z")
VALIDATION_START = pd.Timestamp("2025-01-01T00:00:00Z")
VALIDATION_END = pd.Timestamp("2025-12-31T23:59:59Z")

COOLDOWN_MINUTES = 15

# Frozen from the development-fitted structural map. These are not optimized here.
REGIMES = (
    {
        "name": "overlap_short_h1_6h_neutral_positive",
        "session": "LONDON_NY_OVERLAP",
        "direction": "SHORT",
        "feature": "h1_ret_6h_atr",
        "lower": -0.083102,
        "upper": 0.484133,
    },
    {
        "name": "overlap_long_h1_low_12h_range",
        "session": "LONDON_NY_OVERLAP",
        "direction": "LONG",
        "feature": "h1_range_position_12h",
        "lower": 0.080119,
        "upper": 0.161440,
    },
)

TRIGGERS = {
    ("micro_breakout_15m", "LONG"): "micro_breakout_long",
    ("micro_breakout_15m", "SHORT"): "micro_breakout_short",
    ("trend_pullback_reclaim", "LONG"): "pullback_reclaim_long",
    ("trend_pullback_reclaim", "SHORT"): "pullback_reclaim_short",
    ("momentum_burst_5m", "LONG"): "momentum_burst_long",
    ("momentum_burst_5m", "SHORT"): "momentum_burst_short",
    ("mean_reversion_reclaim", "LONG"): "mean_reversion_reclaim_long",
    ("mean_reversion_reclaim", "SHORT"): "mean_reversion_reclaim_short",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Test fixed M1 trigger families inside two frozen structural regimes. "
            "No parameter optimization."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument(
        "--audit-output",
        type=Path,
        default=None,
        help="Optional per-trigger audit CSV.",
    )
    return parser.parse_args()


def regime_mask(df: pd.DataFrame, regime: dict) -> pd.Series:
    values = df[regime["feature"]]
    return (
        df["session_context"].eq(regime["session"])
        & values.ge(regime["lower"])
        & values.le(regime["upper"])
    )


def trigger_indices(
    df: pd.DataFrame,
    trigger_mask: pd.Series,
    allowed_mask: pd.Series,
    cooldown_minutes: int,
) -> list[int]:
    # Only count a genuine trigger onset. Merely entering a structural regime
    # while the trigger condition was already active is not a new trigger.
    transition = (
        trigger_mask.fillna(False)
        & ~trigger_mask.fillna(False).shift(1, fill_value=False)
    )

    accepted: list[int] = []
    next_allowed: pd.Timestamp | None = None
    cooldown = timedelta(minutes=cooldown_minutes)

    for idx in df.index[transition & allowed_mask]:
        ts = pd.Timestamp(df.at[idx, "time_utc"])
        if next_allowed is not None and ts < next_allowed:
            continue
        accepted.append(int(idx))
        next_allowed = ts + cooldown

    return accepted


def build_audit(df: pd.DataFrame) -> pd.DataFrame:
    arrays = build_market_arrays(df)
    records: list[dict] = []

    for regime in REGIMES:
        allowed = regime_mask(df, regime)
        direction = regime["direction"]

        print(
            f"Regime {regime['name']}: "
            f"{int(allowed.sum())} M1 candles inside frozen state..."
        )

        for setup, setup_direction, column in SETUPS:
            if setup_direction != direction:
                continue

            indices = trigger_indices(
                df,
                df[column],
                allowed,
                COOLDOWN_MINUTES,
            )

            print(
                f"  {setup} {direction}: "
                f"{len(indices)} trigger events..."
            )

            for idx in indices:
                forward = evaluate_forward_returns(
                    arrays,
                    idx,
                    direction,
                    horizons=(15, 30, 60),
                )
                if forward is None:
                    continue

                records.append(
                    {
                        "regime": regime["name"],
                        "direction": direction,
                        "trigger": setup,
                        "signal_time_utc": df.at[idx, "time_utc"],
                        "year": int(df.at[idx, "year"]),
                        "date": df.at[idx, "date"],
                        **forward,
                    }
                )

    audit = pd.DataFrame(records)
    if not audit.empty:
        audit["signal_time_utc"] = pd.to_datetime(
            audit["signal_time_utc"],
            utc=True,
        )

    return audit


def business_days(start: pd.Timestamp, end: pd.Timestamp) -> int:
    return len(pd.date_range(start.date(), end.date(), freq="B"))


def summarize(
    period_name: str,
    start: pd.Timestamp,
    end: pd.Timestamp,
    regime: str,
    direction: str,
    trigger: str,
    subset: pd.DataFrame,
) -> dict:
    days = business_days(start, end)

    return {
        "period": period_name,
        "regime": regime,
        "direction": direction,
        "trigger": trigger,
        "opportunities": len(subset),
        "mean_opportunities_per_weekday": round(len(subset) / days, 3),
        "mean_net_15m_pips": round(float(subset["net_15m_pips"].mean()), 4),
        "mean_net_30m_pips": round(float(subset["net_30m_pips"].mean()), 4),
        "mean_net_60m_pips": round(float(subset["net_60m_pips"].mean()), 4),
        "positive_15m_rate": round(
            float((subset["net_15m_pips"] > 0).mean()),
            4,
        ),
        "positive_30m_rate": round(
            float((subset["net_30m_pips"] > 0).mean()),
            4,
        ),
        "positive_60m_rate": round(
            float((subset["net_60m_pips"] > 0).mean()),
            4,
        ),
    }


def build_summary(audit: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []

    periods = (
        (
            "development_2022_2024",
            DEVELOPMENT_START,
            DEVELOPMENT_END,
        ),
        (
            "validation_2025",
            VALIDATION_START,
            VALIDATION_END,
        ),
    )

    for period_name, start, end in periods:
        period = audit[
            (audit["signal_time_utc"] >= start)
            & (audit["signal_time_utc"] <= end)
        ]

        for (regime, direction, trigger), subset in period.groupby(
            ["regime", "direction", "trigger"],
            sort=True,
        ):
            rows.append(
                summarize(
                    period_name,
                    start,
                    end,
                    regime,
                    direction,
                    trigger,
                    subset,
                )
            )

    return pd.DataFrame(rows)


def print_results(output: pd.DataFrame) -> None:
    dev = output[
        output["period"] == "development_2022_2024"
    ].copy()
    val = output[
        output["period"] == "validation_2025"
    ].copy()

    paired = dev.merge(
        val,
        on=["regime", "direction", "trigger"],
        suffixes=("_dev", "_2025"),
        how="left",
    ).sort_values(
        ["mean_net_60m_pips_dev", "mean_net_30m_pips_dev"],
        ascending=False,
    )

    if paired.empty:
        print("No trigger results available.")
        return

    cols = [
        "regime",
        "direction",
        "trigger",
        "mean_opportunities_per_weekday_dev",
        "mean_net_15m_pips_dev",
        "mean_net_30m_pips_dev",
        "mean_net_60m_pips_dev",
        "positive_60m_rate_dev",
        "mean_opportunities_per_weekday_2025",
        "mean_net_15m_pips_2025",
        "mean_net_30m_pips_2025",
        "mean_net_60m_pips_2025",
        "positive_60m_rate_2025",
    ]

    print("")
    print("Fixed M1 triggers inside frozen structural regimes:")
    print(paired[cols].to_string(index=False))


def main() -> None:
    args = parse_args()

    df = load_candles(args.input_csv)
    df = add_features(df)
    df = add_structure_features(df)

    audit = build_audit(df)
    if audit.empty:
        raise RuntimeError("No structural trigger events were produced.")

    output = build_summary(audit)

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output_csv, index=False)

    if args.audit_output:
        args.audit_output.parent.mkdir(parents=True, exist_ok=True)
        audit.to_csv(args.audit_output, index=False)

    print(f"Wrote: {args.output_csv}")
    print("2026 holdout NOT evaluated.")
    print(
        "Structural thresholds and M1 trigger definitions were frozen before this scan."
    )

    print_results(output)


if __name__ == "__main__":
    main()
