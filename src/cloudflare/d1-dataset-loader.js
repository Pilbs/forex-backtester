import { getInstrumentMetadata } from "../market/instrument-metadata.js";

const PAGE_SIZE = 5000;
const MAX_PAGES = 20;
const MAX_DATASET_ROWS = 100000;

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

export function createD1UsageTracker() {
    return {
        queryCount: 0,
        rowsRead: 0,
        rowsWritten: 0,
        d1DurationMs: 0,
    };
}

function recordUsage(tracker, result) {
    const meta = result?.meta ?? {};

    tracker.queryCount += 1;
    tracker.rowsRead += Number(meta.rows_read ?? 0);
    tracker.rowsWritten += Number(meta.rows_written ?? 0);
    tracker.d1DurationMs += Number(meta.duration ?? 0);
}

export async function getCandlesFromD1({
    db,
    instrument,
    granularity,
    from,
    to,
    usageTracker,
}) {
    if (!db?.prepare) {
        throw new Error("D1 database binding is required");
    }

    const fromMs = toEpochMs(from, "from");
    const toMs = toEpochMs(to, "to");

    if (fromMs >= toMs) {
        throw new Error("from must be before to");
    }

    const candles = [];
    let cursor = fromMs;
    let pages = 0;

    while (cursor < toMs) {
        pages += 1;

        if (pages > MAX_PAGES) {
            throw new Error(`D1 dataset page limit exceeded (${MAX_PAGES})`);
        }

        const result = await db.prepare(`
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
        `).bind(
            instrument,
            granularity,
            cursor,
            toMs,
            PAGE_SIZE
        ).run();

        if (result?.success === false) {
            throw new Error("D1 candle query failed");
        }

        recordUsage(usageTracker, result);

        const rows = result?.results ?? [];

        if (rows.length === 0) {
            break;
        }

        candles.push(...rows.map(rowToCandle));

        if (candles.length > MAX_DATASET_ROWS) {
            throw new Error(`D1 dataset row limit exceeded (${MAX_DATASET_ROWS})`);
        }

        if (rows.length < PAGE_SIZE) {
            break;
        }

        const lastTime = Number(rows.at(-1).time);

        if (!Number.isFinite(lastTime) || lastTime < cursor) {
            throw new Error("D1 candle pagination did not advance");
        }

        cursor = lastTime + 1;
    }

    return candles;
}

export function createCloudflareDatasetLoader({ db, usageTracker }) {
    if (!usageTracker) {
        throw new Error("usageTracker is required");
    }

    return async function loadCloudflareDataset({
        instrument,
        strategyTimeframe,
        executionTimeframe = strategyTimeframe,
        from,
        to,
    }) {
        const instrumentMetadata = getInstrumentMetadata(instrument);
        const strategyCandles = await getCandlesFromD1({
            db,
            instrument,
            granularity: strategyTimeframe,
            from,
            to,
            usageTracker,
        });

        if (strategyCandles.length === 0) {
            throw new Error(
                `No ${instrument} ${strategyTimeframe} candles found for the requested date range`
            );
        }

        const executionCandles = executionTimeframe === strategyTimeframe
            ? strategyCandles
            : await getCandlesFromD1({
                db,
                instrument,
                granularity: executionTimeframe,
                from,
                to,
                usageTracker,
            });

        return {
            config: {
                instrument,
                strategyTimeframe,
                executionTimeframe,
                pipSize: instrumentMetadata.pipSize,
                baseCurrency: instrumentMetadata.baseCurrency,
                quoteCurrency: instrumentMetadata.quoteCurrency,
                from,
                to,
            },
            data: {
                strategyCandleCount: strategyCandles.length,
                executionCandleCount: executionCandles.length,
                firstStrategyCandleTime: strategyCandles[0]?.time ?? null,
                lastStrategyCandleTime: strategyCandles.at(-1)?.time ?? null,
                firstExecutionCandleTime: executionCandles[0]?.time ?? null,
                lastExecutionCandleTime: executionCandles.at(-1)?.time ?? null,
            },
            strategyCandles,
            executionCandles,
        };
    };
}
