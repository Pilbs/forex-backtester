import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createLocalCsvDatasetLoader } from "../local/local-csv-dataset-loader.js";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "strattest-local-csv-"));
const csvPath = path.join(tempDir, "candles.csv");

const header = [
    "time",
    "time_iso",
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
].join(",");

const rows = [
    [
        Date.parse("2025-08-01T00:00:00Z"),
        "2025-08-01T00:00:00.000Z",
        10,
        1.1, 1.2, 1.0, 1.15,
        1.1002, 1.2002, 1.0002, 1.1502,
        1.1001, 1.2001, 1.0001, 1.1501,
    ],
    [
        Date.parse("2025-08-01T00:01:00Z"),
        "2025-08-01T00:01:00.000Z",
        11,
        1.15, 1.25, 1.05, 1.2,
        1.1502, 1.2502, 1.0502, 1.2002,
        1.1501, 1.2501, 1.0501, 1.2001,
    ],
    [
        Date.parse("2025-08-01T00:02:00Z"),
        "2025-08-01T00:02:00.000Z",
        12,
        1.2, 1.3, 1.1, 1.25,
        1.2002, 1.3002, 1.1002, 1.2502,
        1.2001, 1.3001, 1.1001, 1.2501,
    ],
];

await fs.writeFile(
    csvPath,
    [header, ...rows.map((row) => row.join(","))].join("\n") + "\n",
    "utf8"
);

try {
    const loader = createLocalCsvDatasetLoader({
        csvPath,
        granularity: "M1",
    });

    const dataset = await loader({
        instrument: "EUR_USD",
        strategyTimeframe: "M1",
        executionTimeframe: "M1",
        from: "2025-08-01T00:01:00Z",
        to: "2025-08-01T00:03:00Z",
    });

    assert.equal(dataset.data.source, "LOCAL_CSV");
    assert.equal(dataset.data.strategyCandleCount, 2);
    assert.equal(dataset.strategyCandles.length, 2);
    assert.equal(dataset.executionCandles, dataset.strategyCandles);
    assert.equal(
        dataset.strategyCandles[0].time,
        Date.parse("2025-08-01T00:01:00Z")
    );
    assert.equal(dataset.strategyCandles[0].ask.open, 1.1502);
    assert.equal(dataset.strategyCandles[1].mid.close, 1.2501);

    await assert.rejects(
        () => loader({
            instrument: "EUR_USD",
            strategyTimeframe: "M5",
            executionTimeframe: "M5",
            from: "2025-08-01T00:00:00Z",
            to: "2025-08-01T00:03:00Z",
        }),
        /contains M1 candles/
    );

    console.log("Local CSV dataset loader test passed.");
} finally {
    await fs.rm(tempDir, { recursive: true, force: true });
}
