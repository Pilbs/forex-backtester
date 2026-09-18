import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeExperimentCsv } from "../reporting/csv-result-writer.js";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "strattest-csv-result-"));

try {
    const result = {
        experiment: {
            id: "experiment-test",
            parameterGrid: {
                longRangePositionMax: [0.16, 0.25],
            },
        },
        runs: [
            {
                runNumber: 1,
                status: "COMPLETED",
                parameterValues: { longRangePositionMax: 0.16 },
                summary: {
                    totalTrades: 24,
                    winRate: 70.8,
                    totalPnlPips: 94,
                    profitFactor: 2.72,
                    halted: false,
                },
                elapsedMs: 1200,
            },
            {
                runNumber: 2,
                status: "FAILED",
                parameterValues: { longRangePositionMax: 0.25 },
                error: { message: 'bad "run"' },
                elapsedMs: 500,
            },
        ],
    };

    const filePath = await writeExperimentCsv(result, {
        directory: tempDir,
    });

    const csv = await fs.readFile(filePath, "utf8");

    assert.match(csv, /param_longRangePositionMax/);
    assert.match(csv, /totalTrades/);
    assert.match(csv, /2\.72/);
    assert.match(csv, /"bad ""run"""/);

    console.log("Local CSV result writer test passed.");
} finally {
    await fs.rm(tempDir, { recursive: true, force: true });
}
