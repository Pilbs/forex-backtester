from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, _tree


DEVELOPMENT_START = pd.Timestamp("2022-01-01T00:00:00Z")
DEVELOPMENT_END = pd.Timestamp("2024-12-31T23:59:59Z")
VALIDATION_START = pd.Timestamp("2025-01-01T00:00:00Z")
VALIDATION_END = pd.Timestamp("2025-12-31T23:59:59Z")

SESSIONS = ("LONDON_MORNING", "LONDON_NY_OVERLAP")
DIRECTIONS = ("LONG", "SHORT")

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

TARGETS = (
    ("tp3_sl3", 3.0, 3.0),
    ("tp5_sl3", 5.0, 3.0),
)

MAX_DEPTH = 3
MIN_LEAF_SAMPLES = 2500


@dataclass(frozen=True)
class LeafRule:
    leaf_id: int
    rule: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Discover simple intraday rules that predict whether TP is hit before SL. "
            "Trees are trained on decisive 2022-2024 outcomes only and frozen before 2025."
        )
    )
    parser.add_argument("audit_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument("--max-depth", type=int, default=MAX_DEPTH)
    parser.add_argument("--min-leaf-samples", type=int, default=MIN_LEAF_SAMPLES)
    return parser.parse_args()


def load_audit(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)

    required = {
        "state_time_utc",
        "session",
        "direction",
        "net_30m_pips",
        "tp3_sl3_outcome",
        "tp5_sl3_outcome",
        *FEATURES,
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required audit columns: {sorted(missing)}")

    df["state_time_utc"] = pd.to_datetime(df["state_time_utc"], utc=True)
    return df[
        (df["state_time_utc"] >= DEVELOPMENT_START)
        & (df["state_time_utc"] <= VALIDATION_END)
        & df["session"].isin(SESSIONS)
        & df["direction"].isin(DIRECTIONS)
    ].copy().reset_index(drop=True)


def extract_leaf_rules(
    model: DecisionTreeClassifier,
    feature_names: tuple[str, ...],
) -> dict[int, LeafRule]:
    tree = model.tree_
    rules: dict[int, LeafRule] = {}

    def walk(node: int, conditions: list[str]) -> None:
        if tree.feature[node] == _tree.TREE_UNDEFINED:
            rules[node] = LeafRule(
                leaf_id=node,
                rule=" AND ".join(conditions) if conditions else "ALL",
            )
            return

        feature = feature_names[tree.feature[node]]
        threshold = float(tree.threshold[node])

        walk(
            tree.children_left[node],
            [*conditions, f"{feature} <= {threshold:.4f}"],
        )
        walk(
            tree.children_right[node],
            [*conditions, f"{feature} > {threshold:.4f}"],
        )

    walk(0, [])
    return rules


def business_days(start: pd.Timestamp, end: pd.Timestamp) -> int:
    return len(pd.date_range(start.date(), end.date(), freq="B"))


def conservative_trade_pnl(
    subset: pd.DataFrame,
    outcome_col: str,
    target: float,
    stop: float,
) -> pd.Series:
    outcomes = subset[outcome_col]

    # If both TP and SL occur inside the same M1 candle, sequence is unknowable
    # from M1 OHLC. Treat it as a stop for a conservative estimate.
    return pd.Series(
        np.select(
            [
                outcomes.eq("TARGET"),
                outcomes.eq("STOP"),
                outcomes.eq("AMBIGUOUS"),
                outcomes.eq("NEITHER"),
            ],
            [
                target,
                -stop,
                -stop,
                subset["net_30m_pips"],
            ],
            default=subset["net_30m_pips"],
        ),
        index=subset.index,
        dtype=float,
    )


def summarize_leaf(
    period_name: str,
    period_start: pd.Timestamp,
    period_end: pd.Timestamp,
    target_name: str,
    target: float,
    stop: float,
    session: str,
    direction: str,
    leaf_id: int,
    rule: str,
    subset: pd.DataFrame,
) -> dict:
    outcome_col = f"{target_name}_outcome"
    outcomes = subset[outcome_col]

    decisive = outcomes.isin(["TARGET", "STOP"])
    decisive_count = int(decisive.sum())
    target_count = int(outcomes.eq("TARGET").sum())
    stop_count = int(outcomes.eq("STOP").sum())
    ambiguous_count = int(outcomes.eq("AMBIGUOUS").sum())
    neither_count = int(outcomes.eq("NEITHER").sum())

    target_rate = (
        target_count / decisive_count
        if decisive_count
        else np.nan
    )

    decisive_expectancy = (
        (target_count * target - stop_count * stop) / decisive_count
        if decisive_count
        else np.nan
    )

    conservative_pnl = conservative_trade_pnl(
        subset,
        outcome_col,
        target,
        stop,
    )

    days = business_days(period_start, period_end)

    return {
        "period": period_name,
        "target": target_name,
        "session": session,
        "direction": direction,
        "leaf_id": leaf_id,
        "rule": rule,
        "observations": len(subset),
        "mean_opportunities_per_weekday": round(len(subset) / days, 3),
        "decisive_rate": round(decisive_count / len(subset), 4),
        "target_rate_decisive": round(target_rate, 4) if decisive_count else "",
        "decisive_expectancy_pips": (
            round(decisive_expectancy, 4) if decisive_count else ""
        ),
        "conservative_expectancy_pips": round(float(conservative_pnl.mean()), 4),
        "median_conservative_pnl_pips": round(float(conservative_pnl.median()), 4),
        "mean_net_30m_pips": round(float(subset["net_30m_pips"].mean()), 4),
        "targets": target_count,
        "stops": stop_count,
        "ambiguous": ambiguous_count,
        "neither": neither_count,
    }


def fit_family_target(
    df: pd.DataFrame,
    session: str,
    direction: str,
    target_name: str,
    target: float,
    stop: float,
    max_depth: int,
    min_leaf_samples: int,
) -> list[dict]:
    family = df[
        (df["session"] == session)
        & (df["direction"] == direction)
    ].copy()

    development = family[
        (family["state_time_utc"] >= DEVELOPMENT_START)
        & (family["state_time_utc"] <= DEVELOPMENT_END)
    ].dropna(subset=[*FEATURES, f"{target_name}_outcome"])

    validation = family[
        (family["state_time_utc"] >= VALIDATION_START)
        & (family["state_time_utc"] <= VALIDATION_END)
    ].dropna(subset=[*FEATURES, f"{target_name}_outcome"])

    outcome_col = f"{target_name}_outcome"

    train = development[
        development[outcome_col].isin(["TARGET", "STOP"])
    ].copy()

    if len(train) < min_leaf_samples * 2:
        return []

    X_train = train.loc[:, FEATURES]
    y_train = train[outcome_col].eq("TARGET").astype(int)

    model = DecisionTreeClassifier(
        max_depth=max_depth,
        min_samples_leaf=min_leaf_samples,
        random_state=42,
    )
    model.fit(X_train, y_train)

    rules = extract_leaf_rules(model, FEATURES)

    # Apply the frozen tree to every observation, including NEITHER/AMBIGUOUS,
    # so the strategy-level evaluation is not biased toward decisive trades only.
    development = development.copy()
    validation = validation.copy()

    development["leaf_id"] = model.apply(development.loc[:, FEATURES])
    validation["leaf_id"] = model.apply(validation.loc[:, FEATURES])

    rows: list[dict] = []

    for leaf_id, leaf_rule in rules.items():
        dev_leaf = development[development["leaf_id"] == leaf_id]
        if dev_leaf.empty:
            continue

        rows.append(
            summarize_leaf(
                "development_2022_2024",
                DEVELOPMENT_START,
                DEVELOPMENT_END,
                target_name,
                target,
                stop,
                session,
                direction,
                leaf_id,
                leaf_rule.rule,
                dev_leaf,
            )
        )

        val_leaf = validation[validation["leaf_id"] == leaf_id]
        if not val_leaf.empty:
            rows.append(
                summarize_leaf(
                    "validation_2025",
                    VALIDATION_START,
                    VALIDATION_END,
                    target_name,
                    target,
                    stop,
                    session,
                    direction,
                    leaf_id,
                    leaf_rule.rule,
                    val_leaf,
                )
            )

    return rows


def print_shortlist(output: pd.DataFrame) -> None:
    dev = output[
        output["period"] == "development_2022_2024"
    ].copy()
    val = output[
        output["period"] == "validation_2025"
    ].copy()

    dev = dev[
        (dev["mean_opportunities_per_weekday"] >= 3.0)
        & (dev["mean_opportunities_per_weekday"] <= 12.0)
    ].sort_values(
        ["conservative_expectancy_pips", "decisive_expectancy_pips"],
        ascending=False,
    )

    paired = dev.merge(
        val,
        on=[
            "target",
            "session",
            "direction",
            "leaf_id",
            "rule",
        ],
        suffixes=("_dev", "_2025"),
        how="left",
    ).head(24)

    if paired.empty:
        print("No leaves matched the 3-12 opportunities/day frequency band.")
        return

    columns = [
        "target",
        "session",
        "direction",
        "rule",
        "mean_opportunities_per_weekday_dev",
        "target_rate_decisive_dev",
        "decisive_rate_dev",
        "conservative_expectancy_pips_dev",
        "mean_opportunities_per_weekday_2025",
        "target_rate_decisive_2025",
        "decisive_rate_2025",
        "conservative_expectancy_pips_2025",
    ]

    print("")
    print("Best TP-before-SL rules (2025 shown beside development):")
    print(paired[columns].to_string(index=False))


def main() -> None:
    args = parse_args()
    audit = load_audit(args.audit_csv)

    rows: list[dict] = []

    for target_name, target, stop in TARGETS:
        for session in SESSIONS:
            for direction in DIRECTIONS:
                print(
                    f"Training {target_name} {session} {direction}..."
                )
                rows.extend(
                    fit_family_target(
                        audit,
                        session,
                        direction,
                        target_name,
                        target,
                        stop,
                        args.max_depth,
                        args.min_leaf_samples,
                    )
                )

    output = pd.DataFrame(rows)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output_csv, index=False)

    print(f"Wrote: {args.output_csv}")
    print("2026 holdout NOT evaluated.")
    print(
        "Trees were fitted on decisive 2022-2024 outcomes only. "
        "Frozen leaf rules were then applied to all 2025 observations."
    )
    print(
        "Conservative expectancy treats same-M1-candle TP+SL as a stop and "
        "closes NEITHER outcomes at the 30-minute bid/ask return."
    )

    if not output.empty:
        print_shortlist(output)


if __name__ == "__main__":
    main()
