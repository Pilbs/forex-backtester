from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeRegressor, _tree


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

MAX_DEPTH = 3
MIN_LEAF_SAMPLES = 2500
TARGET_CLIP_PIPS = 10.0


@dataclass(frozen=True)
class LeafRule:
    leaf_id: int
    rule: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Discover simple interpretable intraday rules from the behaviour-map audit "
            "using shallow decision trees trained on 2022-2024 only."
        )
    )
    parser.add_argument("audit_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument(
        "--max-depth",
        type=int,
        default=MAX_DEPTH,
        help="Maximum tree depth. Default: 3.",
    )
    parser.add_argument(
        "--min-leaf-samples",
        type=int,
        default=MIN_LEAF_SAMPLES,
        help="Minimum development observations in a leaf. Default: 2500.",
    )
    return parser.parse_args()


def load_audit(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    required = {
        "state_time_utc",
        "session",
        "direction",
        "net_15m_pips",
        "tp3_sl3_outcome",
        "tp5_sl3_outcome",
        *FEATURES,
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required audit columns: {sorted(missing)}")

    df["state_time_utc"] = pd.to_datetime(df["state_time_utc"], utc=True)
    df = df[
        (df["state_time_utc"] >= DEVELOPMENT_START)
        & (df["state_time_utc"] <= VALIDATION_END)
        & df["session"].isin(SESSIONS)
        & df["direction"].isin(DIRECTIONS)
    ].copy()

    return df.reset_index(drop=True)


def extract_leaf_rules(
    model: DecisionTreeRegressor,
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


def tp_metrics(
    outcomes: pd.Series,
    target: float,
    stop: float,
) -> tuple[int, float | None, float | None]:
    decisive = outcomes.isin(["TARGET", "STOP"])
    count = int(decisive.sum())
    if count == 0:
        return 0, None, None

    targets = int((outcomes == "TARGET").sum())
    stops = int((outcomes == "STOP").sum())

    return (
        count,
        targets / count,
        (targets * target - stops * stop) / count,
    )


def business_days(start: pd.Timestamp, end: pd.Timestamp) -> int:
    return len(pd.date_range(start.date(), end.date(), freq="B"))


def summarize_leaf(
    period_name: str,
    period_start: pd.Timestamp,
    period_end: pd.Timestamp,
    session: str,
    direction: str,
    leaf_id: int,
    rule: str,
    subset: pd.DataFrame,
) -> dict:
    days = business_days(period_start, period_end)

    decisive_33, rate_33, exp_33 = tp_metrics(
        subset["tp3_sl3_outcome"],
        3.0,
        3.0,
    )
    decisive_53, rate_53, exp_53 = tp_metrics(
        subset["tp5_sl3_outcome"],
        5.0,
        3.0,
    )

    return {
        "period": period_name,
        "session": session,
        "direction": direction,
        "leaf_id": leaf_id,
        "rule": rule,
        "observations": len(subset),
        "mean_opportunities_per_weekday": round(len(subset) / days, 3),
        "mean_net_15m_pips": round(float(subset["net_15m_pips"].mean()), 4),
        "median_net_15m_pips": round(float(subset["net_15m_pips"].median()), 4),
        "positive_15m_rate": round(float((subset["net_15m_pips"] > 0).mean()), 4),
        "tp3_sl3_decisive": decisive_33,
        "tp3_sl3_target_rate": round(rate_33, 4) if rate_33 is not None else "",
        "tp3_sl3_expectancy_pips": round(exp_33, 4) if exp_33 is not None else "",
        "tp5_sl3_decisive": decisive_53,
        "tp5_sl3_target_rate": round(rate_53, 4) if rate_53 is not None else "",
        "tp5_sl3_expectancy_pips": round(exp_53, 4) if exp_53 is not None else "",
    }


def fit_family(
    df: pd.DataFrame,
    session: str,
    direction: str,
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
    ].copy()

    validation = family[
        (family["state_time_utc"] >= VALIDATION_START)
        & (family["state_time_utc"] <= VALIDATION_END)
    ].copy()

    development = development.dropna(subset=[*FEATURES, "net_15m_pips"])
    validation = validation.dropna(subset=[*FEATURES, "net_15m_pips"])

    if len(development) < min_leaf_samples * 2:
        return []

    X_dev = development.loc[:, FEATURES]
    y_dev = development["net_15m_pips"].clip(
        -TARGET_CLIP_PIPS,
        TARGET_CLIP_PIPS,
    )

    model = DecisionTreeRegressor(
        max_depth=max_depth,
        min_samples_leaf=min_leaf_samples,
        random_state=42,
    )
    model.fit(X_dev, y_dev)

    rules = extract_leaf_rules(model, FEATURES)

    development["leaf_id"] = model.apply(X_dev)
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

    # Keep only rules that are relevant to the intended bot frequency.
    dev = dev[
        (dev["mean_opportunities_per_weekday"] >= 3.0)
        & (dev["mean_opportunities_per_weekday"] <= 12.0)
    ].sort_values(
        ["mean_net_15m_pips", "tp3_sl3_expectancy_pips"],
        ascending=False,
    )

    paired = dev.merge(
        val,
        on=["session", "direction", "leaf_id", "rule"],
        suffixes=("_dev", "_2025"),
        how="left",
    ).head(20)

    if paired.empty:
        print("No discovered leaves matched the 3-12 opportunities/day frequency band.")
        return

    columns = [
        "session",
        "direction",
        "rule",
        "mean_opportunities_per_weekday_dev",
        "mean_net_15m_pips_dev",
        "tp3_sl3_expectancy_pips_dev",
        "tp5_sl3_expectancy_pips_dev",
        "mean_opportunities_per_weekday_2025",
        "mean_net_15m_pips_2025",
        "tp3_sl3_expectancy_pips_2025",
        "tp5_sl3_expectancy_pips_2025",
    ]

    print("")
    print("Best shallow-tree rules (2025 shown beside development):")
    print(paired[columns].to_string(index=False))


def main() -> None:
    args = parse_args()
    audit = load_audit(args.audit_csv)

    rows: list[dict] = []

    for session in SESSIONS:
        for direction in DIRECTIONS:
            print(f"Training {session} {direction}...")
            rows.extend(
                fit_family(
                    audit,
                    session,
                    direction,
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
        "Trees were trained on 2022-2024 only. "
        "2025 was used only to apply the frozen discovered rules."
    )

    if not output.empty:
        print_shortlist(output)


if __name__ == "__main__":
    main()
