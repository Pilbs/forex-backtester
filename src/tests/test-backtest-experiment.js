import assert from "node:assert/strict";

import {
    planBacktestExperiment,
    runBacktestExperiment,
} from "../research/backtest-experiment.js";

const M1 = 60 * 1000;
const start = Date.parse("2026-01-05T10:00:00Z");

function candle(time, bidOpen, bidHigh = bidOpen, bidLow = bidOpen, bidClose = bidOpen) {
    const spread = 0.0001;

    return {
        time,
        complete: true,
        volume: 1,

        bid: {
            open: bidOpen,
            high: bidHigh,
            low: bidLow,
            close: bidClose,
        },

        ask: {
            open: bidOpen + spread,
            high: bidHigh + spread,
            low: bidLow + spread,
            close: bidClose + spread,
        },

        mid: {
            open: bidOpen + spread / 2,
            high: bidHigh + spread / 2,
            low: bidLow + spread / 2,
            close: bidClose + spread / 2,
        },
    };
}

const strategyDefinition = {
    id: "experiment-test",
    name: "Experiment Test",
    version: 1,

    parameters: {
        stopLossPips: {
            type: "number",
            default: 10,
            min: 1,
        },

        takeProfitPips: {
            type: "number",
            default: 10,
            min: 1,
        },
    },

    createStrategy(config) {
        let fired = false;

        return {
            name: "Experiment Test",

            reset() {
                fired = false;
            },

            onCandle() {
                if (fired) {
                    return null;
                }

                fired = true;

                return {
                    action: "ENTER",
                    side: "LONG",

                    size: {
                        type: "UNITS",
                        value: 1000,
                    },

                    stopLoss: {
                        type: "PIPS",
                        value: config.stopLossPips,
                    },

                    takeProfit: {
                        type: "PIPS",
                        value: config.takeProfitPips,
                    },
                };
            },
        };
    },
};

const backtestConfig = {
    instrument: "EUR_USD",
    strategyTimeframe: "M1",
    executionTimeframe: "M1",
    from: "2026-01-05T10:00:00Z",
    to: "2026-01-05T10:04:00Z",
};

const accountConfig = {
    initialCapital: 10000,
    currency: "USD",
    leverage: 30,
};

const executionPolicy = {
    sameCandleConflict: "STOP_FIRST",
    closeOpenTradesAtEnd: true,
};

const parameterGrid = {
    stopLossPips: [5, 10],
    takeProfitPips: [5, 15],
};

const policy = {
    warningRunCount: 3,
    maximumRunCount: 10,
};

const plan = planBacktestExperiment({
    strategyDefinition,
    backtestConfig,
    accountConfig,
    executionPolicy,
    parameterGrid,
    policy,
});

assert.equal(plan.allowed, true);
assert.equal(plan.research.requestedCombinations, 4);
assert.equal(plan.research.validCombinations, 4);
assert.ok(plan.warning);

const rejectedPlan = planBacktestExperiment({
    strategyDefinition,
    backtestConfig,
    accountConfig,
    executionPolicy,

    parameterGrid: {
        stopLossPips: [5, 10, 15],
        takeProfitPips: [5, 10, 15],
    },

    policy: {
        warningRunCount: 2,
        maximumRunCount: 4,
    },
});

assert.equal(rejectedPlan.allowed, false);

const overridePlan = planBacktestExperiment({
    strategyDefinition,
    backtestConfig,
    accountConfig,
    executionPolicy,

    parameterGrid: {
        stopLossPips: [5, 10, 15],
        takeProfitPips: [5, 10, 15],
    },

    policy: {
        warningRunCount: 2,
        maximumRunCount: 4,
    },

    overrideLimits: true,
});

assert.equal(overridePlan.allowed, true);

const dataset = {
    config: {
        instrument: "EUR_USD",
        strategyTimeframe: "M1",
        executionTimeframe: "M1",
        pipSize: 0.0001,
        baseCurrency: "EUR",
        quoteCurrency: "USD",
        from: backtestConfig.from,
        to: backtestConfig.to,
    },

    data: {
        strategyCandleCount: 2,
        executionCandleCount: 3,
        firstStrategyCandleTime: start,
        lastStrategyCandleTime: start + M1,
        firstExecutionCandleTime: start + M1,
        lastExecutionCandleTime: start + M1 * 3,
    },

    strategyCandles: [
        candle(start, 1.1000),
        candle(start + M1, 1.1005),
    ],

    executionCandles: [
        candle(start + M1, 1.1000, 1.1018, 1.0990, 1.1005),
        candle(start + M1 * 2, 1.1005, 1.1010, 1.1000, 1.1007),
        candle(start + M1 * 3, 1.1007, 1.1012, 1.1002, 1.1008),
    ],
};

let datasetLoadCount = 0;

const result = await runBacktestExperiment({
    strategyDefinition,
    backtestConfig,
    accountConfig,
    executionPolicy,
    parameterGrid,
    policy,

    experimentId: "deterministic-experiment-test",
    includeTrades: true,

    datasetLoader: async () => {
        datasetLoadCount++;
        return dataset;
    },
});

assert.equal(datasetLoadCount, 1);
assert.equal(result.schemaVersion, 5);
assert.equal(result.experiment.id, "deterministic-experiment-test");
assert.equal(result.experiment.type, "BACKTEST_PARAMETER_SWEEP");
assert.equal(result.experiment.dataset.strategyCandleCount, 2);
assert.equal(result.experiment.accountConfig.initialCapital, 10000);
assert.equal(result.experiment.executionPolicy.sameCandleConflict, "STOP_FIRST");
assert.equal(result.runs.length, 4);
assert.equal(result.totals.completedRuns, 4);
assert.equal(result.totals.failedRuns, 0);

const configurations = new Set(
    result.runs.map((run) => JSON.stringify(run.parameterValues))
);

assert.equal(configurations.size, 4);

for (const run of result.runs) {
    assert.equal(run.status, "COMPLETED");
    assert.ok(Number.isFinite(run.summary.finalEquity));
    assert.ok(Number.isFinite(run.summary.returnPercent));
    assert.ok(Number.isFinite(run.summary.maxDrawdownPercent));
    assert.equal(run.yearlySummary.length, 1);
    assert.equal(run.monthlySummary.length, 1);
    assert.ok(Array.isArray(run.trades));
}

JSON.parse(JSON.stringify(result));

console.log("Backtest experiment test passed.");
