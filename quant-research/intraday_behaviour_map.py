from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from common.intraday import (
    add_features,
    build_market_arrays,
    evaluate_forward_returns,
    evaluate_path,
    load_candles,
)


DEVELOPMENT_START = pd.Timestamp("2022-01-01T00:00:00Z")
DEVELOPMENT_END = pd.Timestamp("2024-12-31T23:59:59Z")
VALIDATION_START = pd.Timestamp("2025-01-01T00:00:00Z")
VALIDATION_END = pd.Timestamp("2025-12-31T23:59:59Z")

LIQUID_SESSIONS = ("LONDON_MORNING", "LONDON_NY_OVERLAP")
SAMPLE_EVERY_MINUTES = 5
LOOKAHEAD_MINUTES = 30
QUANTILES = 10

FEATURES = (
    "ret_5m_atr",
    "ret_15m_atr",
    "ret_30m_atr",
    "range_position_30",
    "z20",
    "ema9_30_atr",
    "body_atr",
    "atr_relative",
    "spread_pips",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a frequency-aware EUR/USD intraday behaviour map from "
            "fixed 5-minute samples during liquid sessions."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument(
        "--audit-output",
        type=Path,
        default=None,
        help="Optional per-sample audit CSV.",
    )
    return parser.parse_args()


def fit_quantile_edges(values: pd.Series) -> np.ndarray | None:
    clean = values.replace([np.inf, -np.inf], np.nan).dropna()
    if len(clean) < 100:
        return None

    _, edges = pd.qcut(
        clean,
        q=QUANTILES,
        retbins=True,
        duplicates="drop",
    )
    edges = np.unique(edges.astype(float))

    if len(edges) < 3:
        return None

    return edges


def assign_bins(
    values: pd.Series,
    edges: np.ndarray,
) -> pd.Series:
    transfer_edges = edges.copy()
    transfer_edges[0] = -np.inf
    transfer_edges[-1] = np.inf
    labels = [f"Q{i + 1:02d}" for i in range(len(transfer_edges) - 1)]

    return pd.cut(
        values,
        bins=transfer_edges,
        labels=labels,
        include_lowest=True,
        ordered=True,
    )


def build_sample_audit(df: pd.DataFrame) -> pd.DataFrame:
    sample_mask = (
        df["session_context"].isin(LIQUID_SESSIONS)
        & (df["time_utc"].dt.minute % SAMPLE_EVERY_MINUTES == 0)
        & (df["time_utc"] >= DEVELOPMENT_START)
        & (df["time_utc"] <= VALIDATION_END)
    )

    sample_indices = df.index[sample_mask].to_numpy(dtype=int)
    arrays = build_market_arrays(df)

    records: list[dict] = []

    print(f"Fixed-grid market states: {len(sample_indices)}")

    for count, idx in enumerate(sample_indices, start=1):
        if count % 25000 == 0:
            print(f"Evaluated {count}/{len(sample_indices)} states...")

        base = {
            "state_idx": int(idx),
            "state_time_utc": df.at[idx, "time_utc"],
            "date": df.at[idx, "date"],
            "year": int(df.at[idx, "year"]),
            "session": str(df.at[idx, "session_context"]),
        }

        for feature in FEATURES:
            base[feature] = df.at[idx, feature]

        for direction in ("LONG", "SHORT"):
            path = evaluate_path(
                arrays,
                int(idx),
                direction,
                lookahead_minutes=LOOKAHEAD_MINUTES,
            )
            forward = evaluate_forward_returns(
                arrays,
                int(idx),
                direction,
                horizons=(5, 10, 15, 30),
            )

            if path is None or forward is None:
                continue

            record = {
                **base,
                "direction": direction,
                "mfe_30m_pips": path["mfe_30m_pips"],
                "mae_30m_pips": path["mae_30m_pips"],
                "tp3_sl3_outcome": path["tp3_sl3_outcome"],
                "tp5_sl3_outcome": path["tp5_sl3_outcome"],
                "tp5_sl5_outcome": path["tp5_sl5_outcome"],
                **forward,
            }
            records.append(record)

    return pd.DataFrame(records)


def period_days(start: pd.Timestamp, end: pd.Timestamp) -> int:
    return len(pd.date_range(start.date(), end.date(), freq="B"))


def outcome_metrics(
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
    expectancy = (targets * target - stops * stop) / decisive_count

    return decisive_count, target_rate, expectancy


def summarize_bucket(
    period: str,
    period_start: pd.Timestamp,
    period_end: pd.Timestamp,
    session: str,
    direction: str,
    feature: str,
    bucket: str,
    lower: float,
    upper: float,
    subset: pd.DataFrame,
) -> dict:
    days = period_days(period_start, period_end)

    decisive_33, rate_33, exp_33 = outcome_metrics(
        subset["tp3_sl3_outcome"],
        3.0,
        3.0,
    )
    decisive_53, rate_53, exp_53 = outcome_metrics(
        subset["tp5_sl3_outcome"],
        5.0,
        3.0,
    )

    return {
        "period": period,
        "session": session,
        "direction": direction,
        "feature": feature,
        "bucket": bucket,
        "development_lower": round(lower, 6),
        "development_upper": round(upper, 6),
        "observations": len(subset),
        "mean_opportunities_per_weekday": round(len(subset) / days, 3),
        "mean_net_5m_pips": round(float(subset["net_5m_pips"].mean()), 4),
        "mean_net_15m_pips": round(float(subset["net_15m_pips"].mean()), 4),
        "mean_net_30m_pips": round(float(subset["net_30m_pips"].mean()), 4),
        "positive_15m_rate": round(float((subset["net_15m_pips"] > 0).mean()), 4),
        "median_mfe_30m_pips": round(float(subset["mfe_30m_pips"].median()), 3),
        "median_mae_30m_pips": round(float(subset["mae_30m_pips"].median()), 3),
        "tp3_sl3_decisive": decisive_33,
        "tp3_sl3_target_rate": round(rate_33, 4) if rate_33 is not None else "",
        "tp3_sl3_expectancy_pips": round(exp_33, 4) if exp_33 is not None else "",
        "tp5_sl3_decisive": decisive_53,
        "tp5_sl3_target_rate": round(rate_53, 4) if rate_53 is not None else "",
        "tp5_sl3_expectancy_pips": round(exp_53, 4) if exp_53 is not None else "",
    }


def build_behaviour_map(audit: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []

    for session in LIQUID_SESSIONS:
        session_dev = audit[
            (audit["session"] == session)
            & (audit["state_time_utc"] >= DEVELOPMENT_START)
            & (audit["state_time_utc"] <= DEVELOPMENT_END)
        ]

        for feature in FEATURES:
            # Fit the state definition using development data only.
            feature_dev_states = (
                session_dev[["state_idx", feature]]
                .drop_duplicates("state_idx")
            )
            edges = fit_quantile_edges(feature_dev_states[feature])
            if edges is None:
                continue

            lower_upper = [
                (float(edges[i]), float(edges[i + 1]))
                for i in range(len(edges) - 1)
            ]

            for period_name, start, end in (
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
            ):
                period = audit[
                    (audit["session"] == session)
                    & (audit["state_time_utc"] >= start)
                    & (audit["state_time_utc"] <= end)
                ].copy()

                period["bucket"] = assign_bins(period[feature], edges)

                for direction in ("LONG", "SHORT"):
                    directional = period[period["direction"] == direction]

                    for bucket, subset in directional.groupby(
                        "bucket",
                        observed=True,
                        sort=True,
                    ):
                        if subset.empty:
                            continue

                        bucket_num = int(str(bucket).replace("Q", "")) - 1
                        lower, upper = lower_upper[bucket_num]

                        rows.append(
                            summarize_bucket(
                                period_name,
                                start,
                                end,
                                session,
                                direction,
                                feature,
                                str(bucket),
                                lower,
                                upper,
                                subset,
                            )
                        )

    return pd.DataFrame(rows)


def print_shortlist(output: pd.DataFrame) -> None:
    dev = output[
        output["period"] == "development_2022_2024"
    ].copy()
    val = output[
        output["period"] == "validation_2025"
    ].copy()

    dev["tp3_sl3_expectancy_pips"] = pd.to_numeric(
        dev["tp3_sl3_expectancy_pips"],
        errors="coerce",
    )

    # Frequency band deliberately matches the intended eventual bot cadence.
    candidates = dev[
        (dev["observations"] >= 500)
        & (dev["mean_opportunities_per_weekday"] >= 3.0)
        & (dev["mean_opportunities_per_weekday"] <= 12.0)
    ].sort_values(
        ["tp3_sl3_expectancy_pips", "mean_net_15m_pips"],
        ascending=False,
    ).head(20)

    paired = candidates.merge(
        val,
        on=[
            "session",
            "direction",
            "feature",
            "bucket",
            "development_lower",
            "development_upper",
        ],
        suffixes=("_dev", "_2025"),
        how="left",
    )

    if paired.empty:
        print("No behaviour buckets met the frequency/sample threshold.")
        return

    columns = [
        "session",
        "direction",
        "feature",
        "bucket",
        "development_lower",
        "development_upper",
        "mean_opportunities_per_weekday_dev",
        "tp3_sl3_expectancy_pips_dev",
        "mean_net_15m_pips_dev",
        "mean_opportunities_per_weekday_2025",
        "tp3_sl3_expectancy_pips_2025",
        "mean_net_15m_pips_2025",
        "tp5_sl3_expectancy_pips_dev",
        "tp5_sl3_expectancy_pips_2025",
    ]

    print("")
    print("Best development market states (matching 2025 result beside them):")
    print(paired[columns].to_string(index=False))


def main() -> None:
    args = parse_args()

    df = add_features(load_candles(args.input_csv))
    audit = build_sample_audit(df)

    if audit.empty:
        raise RuntimeError("Behaviour-map audit produced no observations.")

    output = build_behaviour_map(audit)

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output_csv, index=False)

    if args.audit_output:
        args.audit_output.parent.mkdir(parents=True, exist_ok=True)
        audit.to_csv(args.audit_output, index=False)

    print(f"Wrote: {args.output_csv}")
    print("2026 holdout NOT evaluated.")
    print(
        "Buckets were fitted on 2022-2024 only; "
        "2025 did not influence their boundaries."
    )

    print_shortlist(output)


if __name__ == "__main__":
    main()
