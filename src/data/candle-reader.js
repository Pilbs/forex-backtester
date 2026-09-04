import { queryD1 } from "./d1-client.js";

function toEpochMs(value, name) {
  if (value instanceof Date) {
    const time = value.getTime();

    if (!Number.isFinite(time)) {
      throw new Error(`Invalid ${name}`);
    }

    return time;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid ${name}`);
    }

    return value;
  }

  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return time;
}

function rowToCandle(row) {
  return {
    time: Number(row.time),
    complete: true,
    volume: Number(row.volume),

    bid: {
      open: Number(row.bid_open),
      high: Number(row.bid_high),
      low: Number(row.bid_low),
      close: Number(row.bid_close),
    },

    ask: {
      open: Number(row.ask_open),
      high: Number(row.ask_high),
      low: Number(row.ask_low),
      close: Number(row.ask_close),
    },

    mid: {
      open: Number(row.mid_open),
      high: Number(row.mid_high),
      low: Number(row.mid_low),
      close: Number(row.mid_close),
    },
  };
}

export async function getCandles({
  instrument,
  granularity,
  from,
  to,
  pageSize = 5000,
}) {
  if (!instrument) {
    throw new Error("instrument is required");
  }

  if (!granularity) {
    throw new Error("granularity is required");
  }

  const fromMs = toEpochMs(from, "from");
  const toMs = toEpochMs(to, "to");

  if (fromMs >= toMs) {
    throw new Error("from must be before to");
  }

  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer");
  }

  const candles = [];

  let cursor = fromMs;

  while (cursor < toMs) {
    const result = await queryD1(
      instrument,
      `
        SELECT
          time,
          volume,

          bid_open,
          bid_high,
          bid_low,
          bid_close,

          ask_open,
          ask_high,
          ask_low,
          ask_close,

          mid_open,
          mid_high,
          mid_low,
          mid_close

        FROM candles

        WHERE instrument = ?
          AND granularity = ?
          AND time >= ?
          AND time < ?

        ORDER BY time ASC

        LIMIT ?
      `,
      [
        instrument,
        granularity,
        cursor,
        toMs,
        pageSize,
      ]
    );

    const rows = result[0]?.results ?? [];

    if (rows.length === 0) {
      break;
    }

    candles.push(...rows.map(rowToCandle));

    if (rows.length < pageSize) {
      break;
    }

    const lastTime = Number(
      rows[rows.length - 1].time
    );

    cursor = lastTime + 1;
  }

  return candles;
}