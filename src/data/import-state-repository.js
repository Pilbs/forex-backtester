import { queryD1 } from "./d1-client.js";

export async function getImportProgress({
  instrument,
  granularity,
  source = "oanda",
}) {
  const result = await queryD1(
    instrument,
    `
      SELECT next_time
      FROM import_progress
      WHERE instrument = ?
        AND granularity = ?
        AND source = ?
    `,
    [instrument, granularity, source]
  );

  return result[0]?.results?.[0]?.next_time ?? null;
}

export async function setImportProgress({
  instrument,
  granularity,
  nextTime,
  source = "oanda",
}) {
  await queryD1(
    instrument,
    `
      INSERT INTO import_progress (
        instrument,
        granularity,
        source,
        next_time,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)

      ON CONFLICT(instrument, granularity, source)
      DO UPDATE SET
        next_time = excluded.next_time,
        updated_at = excluded.updated_at
    `,
    [
      instrument,
      granularity,
      source,
      nextTime,
      Date.now(),
    ]
  );
}



