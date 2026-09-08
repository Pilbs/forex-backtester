import assert from "node:assert/strict";

import {
    planResearch,
    runResearch,
} from "../research/run-research.js";

const researchConfig = {
    strategy: "orb",

    market: {
        instrument: "EUR_USD",
        strategyTimeframe: "M5",
        executionTimeframe: "M5",
        from: "2026-08-01T00:00:00Z",
        to: "2026-08-02T00:00:00Z",
    },

    account: {
        initialCapital: 500,
        currency: "USD",
        leverage: 30,
    },

    execution: {
        sameCandleConflict: "STOP_FIRST",
        closeOpenTradesAtEnd: true,
    },

    strategyConfig: {
        stopLossMode: "PIPS",
        stopLossValue: 10,
        takeProfitMode: "PIPS",
        takeProfitValue: 20,
    },

    parameterGrid: {
        breakoutCondition: ["CLOSE", "WICK"],
    },
};

const plan = planResearch(researchConfig);

assert.equal(plan.strategy.id, "orb");
assert.equal(plan.backtest.instrument, "EUR_USD");
assert.equal(plan.backtest.strategyTimeframe, "M5");
assert.equal(plan.research.requestedCombinations, 2);
assert.equal(plan.research.validCombinations, 2);
assert.equal(plan.allowed, true);

let datasetLoadCount = 0;
let runCount = 0;

const dataset = {
    data: {
        strategyCandleCount: 0,
        executionCandleCount: 0,
    },
};

const result = await runResearch(researchConfig, {
    experimentId: "generic-research-test",

    datasetLoader: async (backtestConfig) => {
        datasetLoadCount++;
        assert.equal(backtestConfig.instrument, "EUR_USD");
        return dataset;
    },

    runWithDataset: async ({
        dataset: suppliedDataset,
        strategy,
        accountConfig,
        executionPolicy,
    }) => {
        runCount++;

        assert.equal(suppliedDataset, dataset);
        assert.equal(typeof strategy.onCandle, "function");
        assert.equal(accountConfig.initialCapital, 500);
        assert.equal(executionPolicy.sameCandleConflict, "STOP_FIRST");

        return {
            summary: {
                totalTrades: 0,
                winRate: 0,
                totalPnlPips: 0,
                netPnlAccount: 0,
                returnPercent: 0,
                profitFactor: null,
                profitFactorAccount: null,
                maxDrawdownPercent: 0,
                expectancyPips: 0,
            },
            trades: [],
            data: dataset.data,
            config: researchConfig.market,
        };
    },
});

assert.equal(datasetLoadCount, 1);
assert.equal(runCount, 2);
assert.equal(result.experiment.id, "generic-research-test");
assert.equal(result.experiment.strategy.id, "orb");
assert.equal(result.experiment.backtest.instrument, "EUR_USD");
assert.equal(result.runs.length, 2);
assert.equal(result.totals.completedRuns, 2);
assert.equal(result.totals.failedRuns, 0);

for (const run of result.runs) {
    assert.equal(run.status, "COMPLETED");
}

console.log("Generic research runner test passed.");
