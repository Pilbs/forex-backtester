import fs from "node:fs";
import readline from "node:readline";

import { getInstrumentMetadata } from "../market/instrument-metadata.js";

const REQUIRED_COLUMNS = [
    "time",
    "volume",
    "bid_open",
    "bid_high",
    "bid_low",
    "bid_close",
    "ask_open",
    "ask_high",
    "ask_low",
    "ask_close",
    "mid_open",
    "mid_high",
    "mid_low",
    "mid_close",
];

function parseEpochMs(value, name) {
    const parsed = Date.parse(value);

    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a valid date/time`);
    }

    return parsed;
}

function parseNumber(value, column, lineNumber) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        throw new Error(
            `Invalid numeric value in ${column} at CSV line ${lineNumber}: ${value}`
        );
    }

    return parsed;
}

function createColumnIndex(header) {
    const index = new Map(header.map((name, position) => [name, position]));

    const missing = REQUIRED_COLUMNS.filter((name) => !index.has(name));

    if (missing.length > 0) {
        throw new Error(
            `CSV is missing required candle columns: ${missing.join(", ")}`
        );
    }

    return index;
}

function valueAt(values, index, column) {
    return values[index.get(column)];
}

function rowToCandle(values, index, lineNumber) {
    const time = parseNumber(valueAt(values, index, "time"), "time", lineNumber);

    return {
        time,
        complete: true,
        volume: parseNumber(
            valueAt(values, index, "volume"),
            "volume",
            lineNumber
        ),
        bid: {
            open: parseNumber(valueAt(values, index, "bid_open"), "bid_open", lineNumber),
            high: parseNumber(valueAt(values, index, "bid_high"), "bid_high", lineNumber),
            low: parseNumber(valueAt(values, index, "bid_low"), "bid_low", lineNumber),
            close: parseNumber(valueAt(values, index, "bid_close"), "bid_close", lineNumber),
        },
        ask: {
            open: parseNumber(valueAt(values, index, "ask_open"), "ask_open", lineNumber),
            high: parseNumber(valueAt(values, index, "ask_high"), "ask_high", lineNumber),
            low: parseNumber(valueAt(values, index, "ask_low"), "ask_low", lineNumber),
            close: parseNumber(valueAt(values, index, "ask_close"), "ask_close", lineNumber),
        },
        mid: {
            open: parseNumber(valueAt(values, index, "mid_open"), "mid_open", lineNumber),
            high: parseNumber(valueAt(values, index, "mid_high"), "mid_high", lineNumber),
            low: parseNumber(valueAt(values, index, "mid_low"), "mid_low", lineNumber),
            close: parseNumber(valueAt(values, index, "mid_close"), "mid_close", lineNumber),
        },
    };
}

export function createLocalCsvDatasetLoader({
    csvPath,
    granularity = "M1",
} = {}) {
    if (typeof csvPath !== "string" || !csvPath.trim()) {
        throw new Error("csvPath is required");
    }

    if (typeof granularity !== "string" || !granularity.trim()) {
        throw new Error("granularity is required");
    }

    return async function loadLocalCsvDataset({
        instrument,
        strategyTimeframe,
        executionTimeframe = strategyTimeframe,
        from,
        to,
    }) {
        if (strategyTimeframe !== granularity) {
            throw new Error(
                `Local CSV contains ${granularity} candles but strategy timeframe is ${strategyTimeframe}`
            );
        }

        if (executionTimeframe !== granularity) {
            throw new Error(
                `Local CSV contains ${granularity} candles but execution timeframe is ${executionTimeframe}`
            );
        }

        const fromMs = parseEpochMs(from, "from");
        const toMs = parseEpochMs(to, "to");

        if (fromMs >= toMs) {
            throw new Error("from must be before to");
        }

        const instrumentMetadata = getInstrumentMetadata(instrument);
        const stream = fs.createReadStream(csvPath, { encoding: "utf8" });
        const lines = readline.createInterface({
            input: stream,
            crlfDelay: Infinity,
        });

        let headerIndex = null;
        let lineNumber = 0;
        let scannedRows = 0;
        const candles = [];

        try {
            for await (const rawLine of lines) {
                lineNumber++;

                const line = rawLine.trim();

                if (!line) {
                    continue;
                }

                const values = line.split(",");

                if (headerIndex === null) {
                    const header = values.map((value) =>
                        value.replace(/^\uFEFF/, "").trim()
                    );
                    headerIndex = createColumnIndex(header);
                    continue;
                }

                scannedRows++;

                const candleTime = Number(valueAt(values, headerIndex, "time"));

                if (!Number.isFinite(candleTime)) {
                    throw new Error(
                        `Invalid time value at CSV line ${lineNumber}: ${valueAt(values, headerIndex, "time")}`
                    );
                }

                if (candleTime < fromMs) {
                    continue;
                }

                if (candleTime >= toMs) {
                    // Exported research data is chronological, so no need to
                    // scan the rest of a multi-year file after the requested range.
                    break;
                }

                candles.push(rowToCandle(values, headerIndex, lineNumber));
            }
        } finally {
            lines.close();
            stream.destroy();
        }

        if (headerIndex === null) {
            throw new Error("Local candle CSV is empty");
        }

        if (candles.length === 0) {
            throw new Error(
                `No ${instrument} ${granularity} candles found in requested range ${from} to ${to}`
            );
        }

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
                source: "LOCAL_CSV",
                csvPath,
                scannedRowCount: scannedRows,
                strategyCandleCount: candles.length,
                executionCandleCount: candles.length,
                firstStrategyCandleTime: candles[0]?.time ?? null,
                lastStrategyCandleTime: candles.at(-1)?.time ?? null,
                firstExecutionCandleTime: candles[0]?.time ?? null,
                lastExecutionCandleTime: candles.at(-1)?.time ?? null,
            },
            strategyCandles: candles,
            executionCandles: candles,
        };
    };
}
