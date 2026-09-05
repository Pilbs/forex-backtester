import assert from "node:assert/strict";

import { runParameterSweep } from "../research/parameter-sweep.js";

let strategyInstances = 0;
const receivedConfigs = [];

const definition = {
    id: "sweep-test",
    name: "Sweep Test",
    version: 1,
    parameters: {
        stopLossPips: {
            type: "number",
            default: 10,
            min: 1,
        },
        takeProfitPips: {
            type: "number",
            default: 20,
            min: 1,
        },
    },
    createStrategy(config) {
        strategyInstances++;
        return {
            name: "Sweep Test",
            instanceNumber: strategyInstances,
            config,
            onCandle() {
                return null;
            },
        };
    },
};

const result = await runParameterSweep({
    strategyDefinition: definition,
    baseStrategyConfig: {
        stopLossPips: 10,
        takeProfitPips: 20,
    },
    parameterGrid: {
        stopLossPips: [5, 10],
        takeProfitPips: [10, 20],
    },
    policy: {
        warningRunCount: 10,
        maximumRunCount: 20,
    },
    executeRun: async ({ strategy, strategyConfig }) => {
        receivedConfigs.push({
            instanceNumber: strategy.instanceNumber,
            ...strategyConfig,
        });

        const pnlPips = strategyConfig.takeProfitPips - strategyConfig.stopLossPips;

        return {
            config: {
                instrument: "TEST",
            },
            data: {
                candleCount: 10,
            },
            summary: {
                totalTrades: 1,
                totalPnlPips: pnlPips,
                rejectedOrderCount: 3,
            },
            rejectedOrders: [
                {
                    reason: "MAX_OPEN_TRADES",
                },
                {
                    reason: "MAX_OPEN_TRADES",
                },
                {
                    reason: "INSUFFICIENT_MARGIN",
                },
            ],
            trades: [{
                side: "LONG",
                entryTime: Date.parse("2025-01-01T00:00:00Z"),
                pnlPips,
            }],
        };
    },
});

if (result.runs.length !== 4 || result.totals.completedRuns !== 4) {
    throw new Error("Sweep did not execute all four parameter combinations");
}

if (
    strategyInstances !== 4 ||
    new Set(receivedConfigs.map((config) => config.instanceNumber)).size !== 4
) {
    throw new Error("Each run did not receive a fresh strategy instance");
}

if (result.runs.some((run) => Object.hasOwn(run, "trades"))) {
    throw new Error("Trades should not be included by default");
}

if (result.runs.some((run) => run.yearlySummary.length !== 1)) {
    throw new Error("Yearly summaries were not captured");
}

for (const run of result.runs) {
    assert.deepEqual(run.rejectionReasons, {
        MAX_OPEN_TRADES: 2,
        INSUFFICIENT_MARGIN: 1,
    });
}

JSON.stringify(result);
console.log("Parameter sweep test passed.");
