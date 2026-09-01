import { queryD1 } from "./d1-client.js";

export async function getImportProgress({
  instrument,
  granularity,
  source = "oanda",
}) {
  const result = await queryD1(
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

export async function getTodayImportUsage() {
  const today = new Date().toISOString().slice(0, 10);

  const result = await queryD1(
    `
      SELECT rows_inserted
      FROM import_usage
      WHERE usage_date = ?
    `,
    [today]
  );

  return result[0]?.results?.[0]?.rows_inserted ?? 0;
}

export async function addTodayImportUsage(rows) {
  if (rows <= 0) {
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  await queryD1(
    `
      INSERT INTO import_usage (
        usage_date,
        rows_inserted,
        updated_at
      )
      VALUES (?, ?, ?)

      ON CONFLICT(usage_date)
      DO UPDATE SET
        rows_inserted = rows_inserted + excluded.rows_inserted,
        updated_at = excluded.updated_at
    `,
    [
      today,
      rows,
      Date.now(),
    ]
  );
}