import "dotenv/config";

import {
  getCandles,
} from "../data/candle-reader.js";

import {
  aggregateCandles,
} from "../data/candle-aggregator.js";

async function main() {
  console.log(
    "Loading real EUR/USD M1 candles..."
  );

  const m1Candles = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",

    from: "2026-08-27T12:10:00Z",
    to: "2026-08-27T13:30:00Z",
  });

  const m5Candles =
    aggregateCandles({
      candles: m1Candles,
      sourceMinutes: 1,
      targetMinutes: 5,
    });

  const newYorkFormatter =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          "America/New_York",

        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }
    );

  console.log("");
  console.log(
    `${m1Candles.length} M1 candles`
  );

  console.log(
    `${m5Candles.length} M5 candles`
  );

  console.log("");
  console.log("Generated M5 candles");

  console.table(
    m5Candles.map((candle) => ({
      timeNY:
        newYorkFormatter.format(
          new Date(candle.time)
        ),

      timeUTC:
        new Date(
          candle.time
        ).toISOString(),

      midOpen:
        candle.mid.open,

      midHigh:
        candle.mid.high,

      midLow:
        candle.mid.low,

      midClose:
        candle.mid.close,

      volume:
        candle.volume,
    }))
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});