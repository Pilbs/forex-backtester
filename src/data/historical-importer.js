import {
  getCandles,
} from "./oanda-client.js";

import {
  normalizeCandles,
} from "./normalize-candle.js";

import {
  insertCandleBatch,
} from "./candle-repository.js";

import {
  getImportProgress,
  setImportProgress,
} from "./import-state-repository.js";

function toEpochMs(value, name) {
  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    throw new Error(
      `Invalid ${name}: ${value}`
    );
  }

  return time;
}

export async function importHistory({
  instrument,
  granularity,
  from,
  to,

  source = "oanda",
  requestCount = 5000,
  d1BatchSize = 1000,
  runWriteLimit = 2_500_000,
}) {
  if (!instrument) {
    throw new Error(
      "instrument is required"
    );
  }

  if (!granularity) {
    throw new Error(
      "granularity is required"
    );
  }

  const normalizedInstrument =
    instrument.toUpperCase();

  const normalizedGranularity =
    granularity.toUpperCase();

  const startTime =
    toEpochMs(from, "from");

  const endTime =
    toEpochMs(to, "to");

  if (startTime >= endTime) {
    throw new Error(
      "from must be before to"
    );
  }

  let cursor =
    await getImportProgress({
      instrument:
        normalizedInstrument,

      granularity:
        normalizedGranularity,

      source,
    });

  if (cursor === null) {
    cursor = startTime;

    await setImportProgress({
      instrument:
        normalizedInstrument,

      granularity:
        normalizedGranularity,

      source,

      nextTime: cursor,
    });
  }

  if (cursor < startTime) {
    cursor = startTime;
  }

  console.log(
    "=== HISTORICAL IMPORT ==="
  );

  console.log(
    `Instrument:   ${normalizedInstrument}`
  );

  console.log(
    `Granularity:  ${normalizedGranularity}`
  );

  console.log(
    `From:         ${new Date(
      startTime
    ).toISOString()}`
  );

  console.log(
    `To:           ${new Date(
      endTime
    ).toISOString()}`
  );

  console.log(
    `Resume from:  ${new Date(
      cursor
    ).toISOString()}`
  );

  console.log("");

  let pulledThisRun = 0;
  let insertedThisRun = 0;

  while (
    cursor < endTime &&
    insertedThisRun <
      runWriteLimit
  ) {
    const data =
      await getCandles({
        instrument:
          normalizedInstrument,

        granularity:
          normalizedGranularity,

        from:
          new Date(
            cursor
          ).toISOString(),

        count: requestCount,
      });

    const received =
      normalizeCandles(
        data.candles
      ).filter(
        (candle) =>
          candle.complete !== false
      );

    if (
      received.length === 0
    ) {
      console.log(
        "No more candles returned by OANDA."
      );

      break;
    }

    pulledThisRun +=
      received.length;

    /*
      OANDA may return candles beyond
      our requested end date.

      Only store candles inside the
      requested history range.
    */
    const candles =
      received.filter(
        (candle) =>
          candle.time < endTime
      );

    if (
      candles.length === 0
    ) {
      cursor = endTime;

      await setImportProgress({
        instrument:
          normalizedInstrument,

        granularity:
          normalizedGranularity,

        source,

        nextTime: endTime,
      });

      break;
    }

    let index = 0;

    while (
      index <
        candles.length &&
      insertedThisRun <
        runWriteLimit
    ) {
      const remainingBudget =
        runWriteLimit -
        insertedThisRun;

      const batchSize =
        Math.min(
          d1BatchSize,
          remainingBudget,
          candles.length -
            index
        );

      const batch =
        candles.slice(
          index,
          index + batchSize
        );

      const inserted =
        await insertCandleBatch({
          instrument:
            normalizedInstrument,

          granularity:
            normalizedGranularity,

          candles: batch,
        });

      insertedThisRun +=
        inserted;

      index += batch.length;

      const lastCandle =
        batch[
          batch.length - 1
        ];

      /*
        +1 millisecond is deliberate.

        We do NOT need to know whether
        this is M1, M5, H1, D, etc.

        We simply request everything
        after the candle we just stored.
      */
      const nextTime =
        lastCandle.time + 1;

      await setImportProgress({
        instrument:
          normalizedInstrument,

        granularity:
          normalizedGranularity,

        source,

        nextTime,
      });

      console.log(
        `${new Date(
          batch[0].time
        ).toISOString()}` +
          ` -> ${new Date(
            lastCandle.time
          ).toISOString()}` +
          ` | received=${batch.length}` +
          ` inserted=${inserted}` +
          ` total=${insertedThisRun}`
      );
    }

    if (
      index <
      candles.length
    ) {
      break;
    }

    const lastReceived =
      received[
        received.length - 1
      ];

    /*
      If OANDA has already returned
      something at/after our end date,
      the requested range is finished.
    */
    if (
      lastReceived.time >=
      endTime
    ) {
      cursor = endTime;

      await setImportProgress({
        instrument:
          normalizedInstrument,

        granularity:
          normalizedGranularity,

        source,

        nextTime: endTime,
      });

      break;
    }

    cursor =
      candles[
        candles.length - 1
      ].time + 1;
  }

  const finalCursor =
    await getImportProgress({
      instrument:
        normalizedInstrument,

      granularity:
        normalizedGranularity,

      source,
    });

  console.log("");
  console.log(
    "=== IMPORT COMPLETE / PAUSED ==="
  );

  console.log(
    `Pulled:       ${pulledThisRun}`
  );

  console.log(
    `Inserted:     ${insertedThisRun}`
  );

  console.log(
    `Next start:   ${new Date(
      finalCursor
    ).toISOString()}`
  );

  if (
    finalCursor >=
    endTime
  ) {
    console.log(
      "Requested historical range complete."
    );
  }

  return {
    instrument:
      normalizedInstrument,

    granularity:
      normalizedGranularity,

    pulled:
      pulledThisRun,

    inserted:
      insertedThisRun,

    nextTime:
      finalCursor,
  };
}