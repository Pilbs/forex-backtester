import "dotenv/config";

import { getCandles } from "../data/candle-reader.js";
import { createDailyOpeningRange } from "../strategies/orb/daily-opening-range.js";
import { getUtcDateKey } from "../time/utc-time.js";

async function main() {
  console.log("Loading real EUR/USD candles from D1...");

  const candles = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",
    from: "2026-08-24T00:00:00Z",
    to: "2026-08-29T00:00:00Z",
  });

  console.log(`Loaded ${candles.length} candles`);

  const dailyRange = createDailyOpeningRange({
    startHour: 12,
    startMinute: 15,
    durationMinutes: 60,
  });

  const ranges = [];

  for (const candle of candles) {
    const candleDate = getUtcDateKey(candle.time);
    const currentState = dailyRange.getState();

    // We are about to move into a new day.
    // Save yesterday's finished range first.
    if (
      currentState.date !== null &&
      currentState.date !== candleDate &&
      currentState.complete
    ) {
      ranges.push({
        ...currentState,
      });
    }

    dailyRange.onCandle(candle);
  }

  // Save final day.
  const finalState = dailyRange.getState();

  if (finalState.complete) {
    ranges.push({
      ...finalState,
    });
  }

  console.log("");
  console.log("Opening Ranges");

  console.table(
    ranges.map((range) => ({
      date: range.date,

      high: range.high,
      low: range.low,

      rangePips: Number(
        ((range.high - range.low) * 10000).toFixed(1)
      ),

      candles: range.candleCount,

      complete: range.complete,
    }))
  );

  if (ranges.length === 0) {
    throw new Error(
      "No completed opening ranges found"
    );
  }

  for (const range of ranges) {
    if (!range.complete) {
      throw new Error(
        `Range for ${range.date} was not complete`
      );
    }

    if (range.candleCount !== 60) {
      throw new Error(
        `${range.date}: expected 60 candles, received ${range.candleCount}`
      );
    }

    if (
      !Number.isFinite(range.high) ||
      !Number.isFinite(range.low)
    ) {
      throw new Error(
        `${range.date}: invalid range prices`
      );
    }

    if (range.high <= range.low) {
      throw new Error(
        `${range.date}: high must be above low`
      );
    }
  }

  console.log("");
  console.log(
    `${ranges.length} real daily opening ranges validated.`
  );

  console.log("");
  console.log("Real opening range test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});