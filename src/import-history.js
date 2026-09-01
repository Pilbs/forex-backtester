import "dotenv/config";

import { getCandles } from "./data/oanda-client.js";
import { normalizeCandles } from "./data/normalize-candle.js";
import { validateCandles } from "./data/validate-candles.js";
import { insertCandleBatch } from "./data/candle-repository.js";

import {
  getImportProgress,
  setImportProgress,
} from "./data/import-state-repository.js";

const INSTRUMENT = "EUR_USD";
const GRANULARITY = "M1";
const SOURCE = "oanda";

const BACKFILL_END =
  Date.parse("2026-09-01T00:00:00Z");

const WINDOW_MS =
  3 * 24 * 60 * 60 * 1000;

const D1_BATCH_SIZE = 1000;

/*
  Safety stop only.
  Expected remaining history is below this.
*/
const RUN_WRITE_LIMIT = 2_500_000;

async function main() {
  let cursor = await getImportProgress({
    instrument: INSTRUMENT,
    granularity: GRANULARITY,
    source: SOURCE,
  });

  if (!cursor) {
    throw new Error(
      "No import progress record exists."
    );
  }

  console.log(
    "=== EUR/USD HISTORICAL BACKFILL ==="
  );

  console.log(
    `Resume from: ${new Date(cursor).toISOString()}`
  );

  console.log(
    `Target:      ${new Date(BACKFILL_END).toISOString()}`
  );

  console.log(
    `Run limit:   ${RUN_WRITE_LIMIT.toLocaleString()} rows`
  );

  console.log("");

  let pulledThisRun = 0;
  let insertedThisRun = 0;

  while (
    cursor < BACKFILL_END &&
    insertedThisRun < RUN_WRITE_LIMIT
  ) {
    const windowEnd = Math.min(
      cursor + WINDOW_MS,
      BACKFILL_END
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

    const candles =
      normalizeCandles(data.candles);

    const quality =
      validateCandles(candles);

    console.log(
      `  received=${quality.candleCount}` +
      ` gaps=${quality.gapCount}` +
      ` missing=${quality.missingMinutes}`
    );

    pulledThisRun += candles.length;

    if (candles.length === 0) {
      await setImportProgress({
        instrument: INSTRUMENT,
        granularity: GRANULARITY,
        source: SOURCE,
        nextTime: windowEnd,
      });

      cursor = windowEnd;
      continue;
    }

    let index = 0;

    while (
      index < candles.length &&
      insertedThisRun < RUN_WRITE_LIMIT
    ) {
      const remainingRunBudget =
        RUN_WRITE_LIMIT - insertedThisRun;

      const batchSize = Math.min(
        D1_BATCH_SIZE,
        remainingRunBudget,
        candles.length - index
      );

      const batch = candles.slice(
        index,
        index + batchSize
      );

      const inserted =
        await insertCandleBatch({
          instrument: INSTRUMENT,
          granularity: GRANULARITY,
          candles: batch,
        });

      insertedThisRun += inserted;
      index += batch.length;

      const lastCandle =
        batch[batch.length - 1];

      const nextTime =
        lastCandle.time + 60_000;

      await setImportProgress({
        instrument: INSTRUMENT,
        granularity: GRANULARITY,
        source: SOURCE,
        nextTime,
      });

      console.log(
        `  batch=${batch.length}` +
        ` inserted=${inserted}` +
        ` run=${insertedThisRun}`
      );
    }

    /*
      Entire OANDA window was processed.
      Move directly to the next window boundary.
    */
    if (index === candles.length) {
      await setImportProgress({
        instrument: INSTRUMENT,
        granularity: GRANULARITY,
        source: SOURCE,
        nextTime: windowEnd,
      });

      cursor = windowEnd;
    } else {
      cursor =
        candles[index - 1].time + 60_000;
    }
  }

  const finalCursor =
    await getImportProgress({
      instrument: INSTRUMENT,
      granularity: GRANULARITY,
      source: SOURCE,
    });

  console.log("");
  console.log("=== IMPORT COMPLETE / PAUSED ===");

  console.log(
    `Pulled this run:   ${pulledThisRun}`
  );

  console.log(
    `Inserted this run: ${insertedThisRun}`
  );

  console.log(
    `Next start: ${new Date(
      finalCursor
    ).toISOString()}`
  );

  if (finalCursor >= BACKFILL_END) {
    console.log("");
    console.log(
      "Historical backfill complete."
    );
  } else if (
    insertedThisRun >= RUN_WRITE_LIMIT
  ) {
    console.log("");
    console.log(
      "Run safety limit reached."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});