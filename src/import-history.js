import "dotenv/config";

import { getCandles } from "./data/oanda-client.js";
import { normalizeCandles } from "./data/normalize-candle.js";
import { validateCandles } from "./data/validate-candles.js";
import {
  insertCandles,
  countCandles,
} from "./data/candle-repository.js";

const INSTRUMENT = "EUR_USD";
const GRANULARITY = "M1";

const FROM = "2021-01-01T00:00:00Z";
const TO = "2026-09-01T00:00:00Z";

// 3 days = maximum 4,320 M1 candles,
// safely under OANDA's 5,000 candle limit.
const WINDOW_MS =
  3 * 24 * 60 * 60 * 1000;

// Leave room below D1's 100k daily write limit.
const MAX_WRITES = 90_000;

async function main() {
  let cursor = Date.parse(FROM);
  const end = Date.parse(TO);

  let totalPulled = 0;
  let totalInserted = 0;

  console.log("=== EUR/USD HISTORICAL BACKFILL ===");
  console.log(`From: ${FROM}`);
  console.log(`To:   ${TO}`);
  console.log("");

  while (cursor < end) {
    if (totalInserted >= MAX_WRITES) {
      console.log("");
      console.log(
        `Write safety limit reached: ${totalInserted}`
      );

      break;
    }

    const windowEnd = Math.min(
      cursor + WINDOW_MS,
      end
    );

    const from = new Date(cursor).toISOString();
    const to = new Date(windowEnd).toISOString();

    console.log(`${from} -> ${to}`);

    const data = await getCandles({
      instrument: INSTRUMENT,
      granularity: GRANULARITY,
      from,
      to,
    });

    let candles = normalizeCandles(data.candles);

    const quality = validateCandles(candles);

    console.log(
      `  received=${quality.candleCount}` +
      ` gaps=${quality.gapCount}` +
      ` missing=${quality.missingMinutes}`
    );

    const remainingWrites =
      MAX_WRITES - totalInserted;

    if (candles.length > remainingWrites) {
      candles = candles.slice(
        0,
        remainingWrites
      );
    }

    const inserted = await insertCandles({
      instrument: INSTRUMENT,
      granularity: GRANULARITY,
      candles,
    });

    totalPulled += candles.length;
    totalInserted += inserted;

    console.log(
      `  inserted=${inserted}` +
      ` total=${totalInserted}`
    );

    /*
     * If we stopped partway through an OANDA window,
     * resume immediately after the last stored candle.
     */
    if (candles.length < data.candles.length) {
      cursor =
        candles[candles.length - 1].time +
        60_000;
    } else {
      cursor = windowEnd;
    }
  }

  const dbCount = await countCandles({
    instrument: INSTRUMENT,
    granularity: GRANULARITY,
  });

  console.log("");
  console.log("=== COMPLETE ===");
  console.log(`Pulled this run:   ${totalPulled}`);
  console.log(`Inserted this run: ${totalInserted}`);
  console.log(`Candles in D1:     ${dbCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});