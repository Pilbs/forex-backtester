import "dotenv/config";

import { getCandles } from "../data/candle-reader.js";

async function main() {
  const candles = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",

    from: "2022-11-10T13:28:00Z",
    to: "2022-11-10T13:33:00Z",

    // Deliberately tiny so we prove pagination works.
    pageSize: 2,
  });

  console.log(`Loaded ${candles.length} candles`);

  console.table(
    candles.map((candle) => ({
      time: new Date(candle.time).toISOString(),

      bidClose: candle.bid.close,
      askClose: candle.ask.close,
      midClose: candle.mid.close,

      spreadPips: Number(
        (
          (candle.ask.close - candle.bid.close) *
          10000
        ).toFixed(2)
      ),

      midRangePips: Number(
        (
          (candle.mid.high - candle.mid.low) *
          10000
        ).toFixed(1)
      ),
    }))
  );

  if (candles.length !== 5) {
    throw new Error(
      `Expected 5 candles, received ${candles.length}`
    );
  }

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time <= candles[i - 1].time) {
      throw new Error(
        "Candles are not in chronological order"
      );
    }
  }

  const cpiCandle = candles.find(
    (candle) =>
      new Date(candle.time).toISOString() ===
      "2022-11-10T13:30:00.000Z"
  );

  if (!cpiCandle) {
    throw new Error(
      "Could not find the 13:30 CPI candle"
    );
  }

  console.log(
    "13:30 CPI candle mid range:",
    (
      (cpiCandle.mid.high - cpiCandle.mid.low) *
      10000
    ).toFixed(1),
    "pips"
  );

  console.log("Candle reader test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});