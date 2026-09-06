import assert from "node:assert/strict";

import {
    createCloudflareDatasetLoader,
    createD1UsageTracker,
} from "../cloudflare/d1-dataset-loader.js";

const start = Date.parse("2026-08-01T12:00:00Z");
const M5 = 5 * 60 * 1000;

function row(time) {
    return {
        time,
        volume: 10,
        bid_open: 1.1,
        bid_high: 1.1,
        bid_low: 1.1,
        bid_close: 1.1,
        ask_open: 1.1001,
        ask_high: 1.1001,
        ask_low: 1.1001,
        ask_close: 1.1001,
        mid_open: 1.10005,
        mid_high: 1.10005,
        mid_low: 1.10005,
        mid_close: 1.10005,
    };
}

const rows = Array.from({ length: 20 }, (_, index) => row(start + index * M5));

const db = {
    prepare() {
        return {
            bind(instrument, granularity, from, to, limit) {
                return {
                    async run() {
                        const results = rows
                            .filter((item) => item.time >= from && item.time < to)
                            .slice(0, limit);

                        return {
                            success: true,
                            results,
                            meta: {
                                rows_read: results.length,
                                rows_written: 0,
                                duration: 1.25,
                            },
                        };
                    },
                };
            },
        };
    },
};

const usageTracker = createD1UsageTracker();
const loader = createCloudflareDatasetLoader({ db, usageTracker });
const dataset = await loader({
    instrument: "EUR_USD",
    strategyTimeframe: "M5",
    executionTimeframe: "M5",
    from: new Date(start).toISOString(),
    to: new Date(start + 20 * M5).toISOString(),
});

assert.equal(dataset.strategyCandles.length, 20);
assert.equal(dataset.executionCandles, dataset.strategyCandles);
assert.equal(dataset.data.strategyCandleCount, 20);
assert.equal(usageTracker.queryCount, 1);
assert.equal(usageTracker.rowsRead, 20);
assert.equal(usageTracker.rowsWritten, 0);
assert.equal(usageTracker.d1DurationMs, 1.25);

console.log("Cloudflare D1 dataset loader test passed.");
