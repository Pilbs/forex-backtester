import {
  queryD1,
  queryD1Batch,
} from "./d1-client.js";

const INSERT_SQL = `
  INSERT OR IGNORE INTO candles (
    instrument,
    granularity,
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
    mid_close,

    source
  )
  VALUES (
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?
  )
`;

function createInsertStatement(
  instrument,
  granularity,
  candle
) {
  return {
    sql: INSERT_SQL,

    params: [
      instrument,
      granularity,
      candle.time,
      candle.volume,

      candle.bid.open,
      candle.bid.high,
      candle.bid.low,
      candle.bid.close,

      candle.ask.open,
      candle.ask.high,
      candle.ask.low,
      candle.ask.close,

      candle.mid.open,
      candle.mid.high,
      candle.mid.low,
      candle.mid.close,

      "oanda",
    ],
  };
}

export async function insertCandles({
  instrument,
  granularity,
  candles,
  batchSize = 250,
}) {
  let inserted = 0;

  for (let i = 0; i < candles.length; i += batchSize) {
    const batch = candles.slice(i, i + batchSize);

    const statements = batch.map((candle) =>
      createInsertStatement(
        instrument,
        granularity,
        candle
      )
    );

    const results = await queryD1Batch(statements);

    for (const result of results) {
      inserted += result.meta?.changes ?? 0;
    }
  }

  return inserted;
}

export async function countCandles({
  instrument,
  granularity,
}) {
  const result = await queryD1(
    `
      SELECT COUNT(*) AS count
      FROM candles
      WHERE instrument = ?
        AND granularity = ?
    `,
    [instrument, granularity]
  );

  return result[0].results[0].count;
}

export async function insertCandleBatch({
  instrument,
  granularity,
  candles,
}) {
  if (candles.length === 0) {
    return 0;
  }

  const statements = candles.map((candle) =>
    createInsertStatement(
      instrument,
      granularity,
      candle
    )
  );

  const results = await queryD1Batch(statements);

  let inserted = 0;

  for (const result of results) {
    inserted += result.meta?.changes ?? 0;
  }

  return inserted;
}