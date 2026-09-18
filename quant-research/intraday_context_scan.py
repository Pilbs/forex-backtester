from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from common.intraday import (
    SETUPS,
    add_features,
    build_market_arrays,
    directional_context,
    evaluate_path,
    event_indices,
    finalize_trade_frame,
    load_candles,
)


COOLDOWN_MINUTES = 15

PERIODS = {
    "development_2022_2024": (
        pd.Timestamp("2022-01-01T00:00:00Z"),
        pd.Timestamp("2024-12-31T23:59:59Z"),
    ),
    "validation_2025": (
        pd.Timestamp("2025-01-01T00:00:00Z"),
        pd.Timestamp("2025-12-31T23:59:59Z"),
    ),
}

CONTEXT_FACTORS = (
    "session_context",
    "volatility_context",
    "direction_context",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Measure whether predefined intraday context filters improve "
            "high-frequency EUR/USD setup behaviour after bid/ask spread."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument(
        "--audit-output",
        type=Path,
        default=None,
        help="Optional per-opportunity context audit CSV.",
    )
    parser.add_argument(
        "--cooldown-minutes",
        type=int,
        default=COOLDOWN_MINUTES,
    )
    return parser.parse_args()


def expectancy(
    outcomes: pd.Series,
    target: float,
    stop: float,
) -> tuple[int, float | None, float | None]:
    decisive = outcomes.isin(["TARGET", "STOP"])
    decisive_count = int(decisive.sum())
    if decisive_count == 0:
        return 0, None, None

    targets = int((outcomes == "TARGET").sum())
    stops = int((outcomes == "STOP").sum())

    target_rate = targets / decisive_count
    exp = (targets * target - stops * stop) / decisive_count
    return decisive_count, target_rate, exp


def business_day_count(start: pd.Timestamp, end: pd.Timestamp) -> int:
    return len(pd.date_range(start.date(), end.date(), freq="B"))


def summarize_bucket(
    period_name: str,
    period_start: pd.Timestamp,
    period_end: pd.Timestamp,
    setup: str,
    direction: str,
    factor: str,
    bucket: str,
    subset: pd.DataFrame,
) -> dict:
    days = business_day_count(period_start, period_end)

    decisive_3, rate_3, exp_3 = expectancy(
        subset["tp3_sl3_outcome"],
        3.0,
        3.0,
    )
    decisive_53, rate_53, exp_53 = expectancy(
        subset["tp5_sl3_outcome"],
        5.0,
        3.0,
    )

    return {
        "period": period_name,
        "setup": setup,
        "direction": direction,
        "context_factor": factor,
        "context_bucket": bucket,
        "opportunities": len(subset),
        "mean_opportunities_per_weekday": round(len(subset) / days, 3),
        "median_mfe_60m_pips": round(float(subset["mfe_60m_pips"].median()), 3),
        "median_mae_60m_pips": round(float(subset["mae_60m_pips"].median()), 3),
        "tp3_sl3_decisive": decisive_3,
        "tp3_sl3_target_rate": round(rate_3, 4) if rate_3 is not None else "",
        "tp3_sl3_expectancy_pips": round(exp_3, 4) if exp_3 is not None else "",
        "tp5_sl3_decisive": decisive_53,
        "tp5_sl3_target_rate": round(rate_53, 4) if rate_53 is not None else "",
        "tp5_sl3_expectancy_pips": round(exp_53, 4) if exp_53 is not None else "",
    }


def build_trade_audit(
    df: pd.DataFrame,
    cooldown_minutes: int,
) -> pd.DataFrame:
    arrays = build_market_arrays(df)
    all_trades: list[pd.DataFrame] = []

    for setup, direction, column in SETUPS:
        indices = event_indices(
            df,
            df[column],
            cooldown_minutes=cooldown_minutes,
        )
        direction_labels = directional_context(df, direction)

        print(f"Scanning {setup} {direction}: {len(indices)} candidate events...")

        records: list[dict] = []
        for idx in indices:
            result = evaluate_path(arrays, idx, direction)
            if result is None:
                continue

            result["setup"] = setup
            result["session_context"] = str(df.at[idx, "session_context"])
            vol = df.at[idx, "volatility_context"]
            result["volatility_context"] = (
                str(vol) if pd.notna(vol) else "UNKNOWN"
            )
            result["direction_context"] = str(direction_labels.at[idx])
            records.append(result)

        trades = finalize_trade_frame(records)
        if not trades.empty:
            all_trades.append(trades)

    if not all_trades:
        return pd.DataFrame()

    return pd.concat(all_trades, ignore_index=True)


def summarize_contexts(audit: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []

    for period_name, (start, end) in PERIODS.items():
        period = audit[
            (audit["entry_time_utc"] >= start)
            & (audit["entry_time_utc"] <= end)
        ]

        for (setup, direction), family in period.groupby(
            ["setup", "direction"],
            sort=True,
        ):
            for factor in CONTEXT_FACTORS:
                for bucket, subset in family.groupby(factor, sort=True):
                    if subset.empty:
                        continue
                    rows.append(
                        summarize_bucket(
                            period_name,
                            start,
                            end,
                            setup,
                            direction,
                            factor,
                            str(bucket),
                            subset,
                        )
                    )

    return pd.DataFrame(rows)


def print_discovery_shortlist(output: pd.DataFrame) -> None:
    development = output[
        output["period"] == "development_2022_2024"
    ].copy()

    development["tp3_sl3_expectancy_pips"] = pd.to_numeric(
        development["tp3_sl3_expectancy_pips"],
        errors="coerce",
    )

    development = development[
        (development["opportunities"] >= 300)
        & (development["mean_opportunities_per_weekday"] >= 1.0)
    ].sort_values(
        "tp3_sl3_expectancy_pips",
        ascending=False,
    ).head(12)

    validation = output[
        output["period"] == "validation_2025"
    ].copy()

    paired = development.merge(
        validation,
        on=[
            "setup",
            "direction",
            "context_factor",
            "context_bucket",
        ],
        suffixes=("_dev", "_2025"),
        how="left",
    )

    if paired.empty:
        print("No context slices met the minimum sample/frequency threshold.")
        return

    print("")
    print("Best development context slices (2025 shown only as a check):")
    columns = [
        "setup",
        "direction",
        "context_factor",
        "context_bucket",
        "mean_opportunities_per_weekday_dev",
        "tp3_sl3_expectancy_pips_dev",
        "mean_opportunities_per_weekday_2025",
        "tp3_sl3_expectancy_pips_2025",
        "tp5_sl3_expectancy_pips_dev",
        "tp5_sl3_expectancy_pips_2025",
    ]
    print(paired[columns].to_string(index=False))


def main() -> None:
    args = parse_args()

    df = add_features(load_candles(args.input_csv))
    audit = build_trade_audit(df, args.cooldown_minutes)

    if audit.empty:
        raise RuntimeError("No opportunities were produced.")

    output = summarize_contexts(audit)

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output_csv, index=False)

    if args.audit_output:
        args.audit_output.parent.mkdir(parents=True, exist_ok=True)
        audit.to_csv(args.audit_output, index=False)

    print(f"Wrote: {args.output_csv}")
    print("2026 holdout NOT evaluated.")
    print("")
    print(
        "Context factors are tested independently. "
        "No context combinations are being optimised yet."
    )

    print_discovery_shortlist(output)


if __name__ == "__main__":
    main()
