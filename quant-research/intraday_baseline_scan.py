from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from common.intraday import (
    SETUPS,
    TARGET_STOP_PAIRS,
    add_features,
    build_market_arrays,
    evaluate_path,
    event_indices,
    finalize_trade_frame,
    load_candles,
)


COOLDOWN_MINUTES = 15


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
    )
    return parser.parse_args()


def summarize(setup: str, direction: str, trades: pd.DataFrame) -> list[dict]:
    rows: list[dict] = []

    periods = [
        ("all_2022_2025", trades),
        *[
            (str(year), trades[trades["year"] == year])
            for year in (2022, 2023, 2024, 2025)
        ],
    ]

    for period, subset in periods:
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
                round(targets / decisive_count, 4)
                if decisive_count
                else ""
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

        print(f"Scanning {setup} {direction}: {len(indices)} candidate events...")

        records: list[dict] = []
        for idx in indices:
            result = evaluate_path(arrays, idx, direction)
            if result is None:
                continue
            result["setup"] = setup
            records.append(result)

        trades = finalize_trade_frame(records)
        if trades.empty:
            continue

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
    print("This scan measures opportunities, not a finished strategy.")

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
