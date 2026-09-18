from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from common.intraday import (
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

LIQUID_SESSIONS = ("LONDON_MORNING", "LONDON_NY_OVERLAP")
SAMPLE_EVERY_MINUTES = 5
QUANTILES = 10

FEATURES = (
    "distance_to_prev_day_high_pips",
    "distance_from_prev_day_low_pips",
    "prev_day_range_position",
    "distance_from_day_open_pips",
    "trading_day_range_position",
    "distance_from_london_open_pips",
    "london_range_position",
    "h1_ret_3h_atr",
    "h1_ret_6h_atr",
    "h1_range_position_12h",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Descriptive EUR/USD structural-context map using price location "
            "and closed-H1 information. No parameter sweep."
        )
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument(
        "--audit-output",
        type=Path,
        default=None,
        help="Optional per-sample structural audit CSV.",
    )
    return parser.parse_args()


def fit_edges(values: pd.Series) -> np.ndarray | None:
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
    return edges if len(edges) >= 3 else None


def assign_bins(values: pd.Series, edges: np.ndarray) -> pd.Series:
    bins = edges.copy()
    bins[0] = -np.inf
    bins[-1] = np.inf
    labels = [f"Q{i + 1:02d}" for i in range(len(bins) - 1)]

    return pd.cut(
        values,
        bins=bins,
        labels=labels,
        include_lowest=True,
        ordered=True,
    )


def build_audit(df: pd.DataFrame) -> pd.DataFrame:
    mask = (
        df["session_context"].isin(LIQUID_SESSIONS)
        & (df["time_utc"].dt.minute % SAMPLE_EVERY_MINUTES == 0)
        & (df["time_utc"] >= DEVELOPMENT_START)
        & (df["time_utc"] <= VALIDATION_END)
    )

    indices = df.index[mask].to_numpy(dtype=int)
    arrays = build_market_arrays(df)

    rows: list[dict] = []

    print(f"Fixed-grid structural states: {len(indices)}")

    for count, idx in enumerate(indices, start=1):
        if count % 25000 == 0:
            print(f"Evaluated {count}/{len(indices)} states...")

        base = {
            "state_idx": int(idx),
            "state_time_utc": df.at[idx, "time_utc"],
            "year": int(df.at[idx, "year"]),
            "date": df.at[idx, "date"],
            "session": str(df.at[idx, "session_context"]),
        }

        for feature in FEATURES:
            base[feature] = df.at[idx, feature]

        for direction in ("LONG", "SHORT"):
            forward = evaluate_forward_returns(
                arrays,
                int(idx),
                direction,
                horizons=(15, 30, 60),
            )
            if forward is None:
                continue

            rows.append(
                {
                    **base,
                    "direction": direction,
                    **forward,
                }
            )

    return pd.DataFrame(rows)


def business_days(start: pd.Timestamp, end: pd.Timestamp) -> int:
    return len(pd.date_range(start.date(), end.date(), freq="B"))


def summarize_bucket(
    period: str,
    start: pd.Timestamp,
    end: pd.Timestamp,
    session: str,
    direction: str,
    feature: str,
    bucket: str,
    lower: float,
    upper: float,
    subset: pd.DataFrame,
) -> dict:
    days = business_days(start, end)

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
        "mean_net_15m_pips": round(float(subset["net_15m_pips"].mean()), 4),
        "mean_net_30m_pips": round(float(subset["net_30m_pips"].mean()), 4),
        "mean_net_60m_pips": round(float(subset["net_60m_pips"].mean()), 4),
        "positive_15m_rate": round(float((subset["net_15m_pips"] > 0).mean()), 4),
        "positive_30m_rate": round(float((subset["net_30m_pips"] > 0).mean()), 4),
        "positive_60m_rate": round(float((subset["net_60m_pips"] > 0).mean()), 4),
    }


def build_map(audit: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []

    for session in LIQUID_SESSIONS:
        dev_session = audit[
            (audit["session"] == session)
            & (audit["state_time_utc"] >= DEVELOPMENT_START)
            & (audit["state_time_utc"] <= DEVELOPMENT_END)
        ]

        for feature in FEATURES:
            state_values = (
                dev_session[["state_idx", feature]]
                .drop_duplicates("state_idx")
            )
            edges = fit_edges(state_values[feature])
            if edges is None:
                continue

            ranges = [
                (float(edges[i]), float(edges[i + 1]))
                for i in range(len(edges) - 1)
            ]

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
                        lower, upper = ranges[bucket_num]

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

    candidates = dev[
        (dev["observations"] >= 500)
        & (dev["mean_opportunities_per_weekday"] >= 3.0)
        & (dev["mean_opportunities_per_weekday"] <= 12.0)
    ].sort_values(
        ["mean_net_15m_pips", "mean_net_30m_pips"],
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
        print("No structural buckets met the sample/frequency threshold.")
        return

    cols = [
        "session",
        "direction",
        "feature",
        "bucket",
        "development_lower",
        "development_upper",
        "mean_opportunities_per_weekday_dev",
        "mean_net_15m_pips_dev",
        "mean_net_30m_pips_dev",
        "mean_net_60m_pips_dev",
        "mean_opportunities_per_weekday_2025",
        "mean_net_15m_pips_2025",
        "mean_net_30m_pips_2025",
        "mean_net_60m_pips_2025",
    ]

    print("")
    print("Best structural states (matching 2025 result beside them):")
    print(paired[cols].to_string(index=False))


def main() -> None:
    args = parse_args()

    df = load_candles(args.input_csv)
    df = add_features(df)
    df = add_structure_features(df)

    audit = build_audit(df)
    if audit.empty:
        raise RuntimeError("Structural audit produced no observations.")

    output = build_map(audit)

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output_csv, index=False)

    if args.audit_output:
        args.audit_output.parent.mkdir(parents=True, exist_ok=True)
        audit.to_csv(args.audit_output, index=False)

    print(f"Wrote: {args.output_csv}")
    print("2026 holdout NOT evaluated.")
    print(
        "This map is descriptive only: fixed 5-minute sampling, "
        "development-fitted state buckets, and cost-aware forward returns."
    )

    print_shortlist(output)


if __name__ == "__main__":
    main()
