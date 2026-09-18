from __future__ import annotations

import argparse
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd


NY = ZoneInfo("America/New_York")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure EUR/USD behaviour after a New York opening-range breakout."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument("--start-hour", type=int, default=8)
    parser.add_argument("--start-minute", type=int, default=15)
    parser.add_argument("--duration-minutes", type=int, default=60)
    return parser.parse_args()


def load_candles(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    required = {
        "time_iso",
        "mid_open",
        "mid_high",
        "mid_low",
        "mid_close",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    df["time_utc"] = pd.to_datetime(df["time_iso"], utc=True)
    df["time_ny"] = df["time_utc"].dt.tz_convert("America/New_York")
    df["session_date"] = df["time_ny"].dt.date
    return df.sort_values("time_utc").reset_index(drop=True)


def signed_move(direction: str, from_price: float, to_price: float) -> float:
    raw = to_price - from_price
    return raw if direction == "UP" else -raw


def study_day(
    day: pd.DataFrame,
    start_hour: int,
    start_minute: int,
    duration_minutes: int,
) -> dict | None:
    if day.empty:
        return None

    date_value = day.iloc[0]["session_date"]
    start = pd.Timestamp(
        year=date_value.year,
        month=date_value.month,
        day=date_value.day,
        hour=start_hour,
        minute=start_minute,
        tz="America/New_York",
    )
    end = start + pd.Timedelta(minutes=duration_minutes)

    orb = day[(day["time_ny"] >= start) & (day["time_ny"] < end)]
    after = day[day["time_ny"] >= end]

    if orb.empty or after.empty:
        return None

    orb_high = float(orb["mid_high"].max())
    orb_low = float(orb["mid_low"].min())
    orb_size = orb_high - orb_low

    breakout_row = None
    direction = None

    for _, row in after.iterrows():
        close = float(row["mid_close"])
        if close > orb_high:
            breakout_row = row
            direction = "UP"
            break
        if close < orb_low:
            breakout_row = row
            direction = "DOWN"
            break

    if breakout_row is None or direction is None:
        return {
            "session_date": str(date_value),
            "orb_start_ny": start.isoformat(),
            "orb_end_ny": end.isoformat(),
            "orb_high": orb_high,
            "orb_low": orb_low,
            "orb_size": orb_size,
            "breakout_direction": "",
            "breakout_time_ny": "",
            "breakout_price": "",
        }

    breakout_time = breakout_row["time_ny"]
    breakout_price = float(breakout_row["mid_close"])

    result = {
        "session_date": str(date_value),
        "orb_start_ny": start.isoformat(),
        "orb_end_ny": end.isoformat(),
        "orb_high": orb_high,
        "orb_low": orb_low,
        "orb_size": orb_size,
        "breakout_direction": direction,
        "breakout_time_ny": breakout_time.isoformat(),
        "breakout_price": breakout_price,
    }

    post = day[day["time_ny"] >= breakout_time].copy()

    for minutes in (15, 30, 60, 120):
        target_time = breakout_time + pd.Timedelta(minutes=minutes)
        eligible = post[post["time_ny"] <= target_time]
        if eligible.empty:
            result[f"move_{minutes}m"] = None
            continue

        close_price = float(eligible.iloc[-1]["mid_close"])
        result[f"move_{minutes}m"] = signed_move(
            direction,
            breakout_price,
            close_price,
        )

    horizon_end = breakout_time + pd.Timedelta(minutes=120)
    horizon = post[post["time_ny"] <= horizon_end]

    if not horizon.empty:
        if direction == "UP":
            mfe = float(horizon["mid_high"].max()) - breakout_price
            mae = breakout_price - float(horizon["mid_low"].min())
        else:
            mfe = breakout_price - float(horizon["mid_low"].min())
            mae = float(horizon["mid_high"].max()) - breakout_price

        result["mfe_120m"] = mfe
        result["mae_120m"] = mae
    else:
        result["mfe_120m"] = None
        result["mae_120m"] = None

    return result


def main() -> None:
    args = parse_args()
    candles = load_candles(args.input_csv)

    rows = []
    for _, day in candles.groupby("session_date", sort=True):
        result = study_day(
            day,
            start_hour=args.start_hour,
            start_minute=args.start_minute,
            duration_minutes=args.duration_minutes,
        )
        if result is not None:
            rows.append(result)

    output = pd.DataFrame(rows)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output_csv, index=False)

    breakouts = output["breakout_direction"].ne("").sum() if not output.empty else 0
    print(f"Sessions analysed: {len(output)}")
    print(f"Sessions with a breakout: {breakouts}")
    print(f"Wrote: {args.output_csv}")


if __name__ == "__main__":
    main()
