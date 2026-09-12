import assert from "node:assert/strict";

import {
    calculatePeriodInsights,
    createFollowUpName,
    createHistoricalExportBaseName,
    createHistoricalJson,
    createHistoricalRunsCsv,
    createRunComparison,
    filterRuns,
    isStrategyParameterEnabled,
} from "../web/public/dashboard-analysis.js";

const conditionalStrategy = {
    parameters: [
        { id: "enabled" },
        { id: "mode", enabledWhen: { parameter: "enabled", equals: true } },
        {
            id: "value",
            enabledWhen: [
                { parameter: "enabled", equals: true },
                { parameter: "mode", equals: "ATR" },
            ],
        },
    ],
};

assert.equal(
    isStrategyParameterEnabled(conditionalStrategy, "value", { enabled: false, mode: "ATR" }),
    false
);
assert.equal(
    isStrategyParameterEnabled(conditionalStrategy, "value", { enabled: true, mode: "ATR" }),
    true
);
assert.equal(
    isStrategyParameterEnabled(
        conditionalStrategy,
        "value",
        { enabled: false, mode: "ATR" },
        { enabled: [false, true] }
    ),
    true
);

assert.equal(createFollowUpName("ORB optimisation", "ORB"), "ORB optimisation – follow-up 1");
assert.equal(
    createFollowUpName("ORB optimisation – follow-up 1", "ORB"),
    "ORB optimisation – follow-up 2"
);
assert.equal(
    createFollowUpName("ORB optimisation follow-up follow-up", "ORB"),
    "ORB optimisation – follow-up 3"
);

const runs = [
    {
        id: "run-1",
        runNumber: 1,
        status: "COMPLETED",
        parameterValues: { smaLength: 10 },
        strategyConfig: { smaLength: 10, direction: "BOTH" },
        summary: {
            totalTrades: 100,
            winRate: 55,
            returnPercent: 4.5,
            profitFactor: 1.6,
            maxDrawdownPercent: 2.5,
        },
        detailCounts: { signals: 101 },
        rejectionReasons: {},
        periods: [{
            type: "MONTH",
            key: "2026-01",
            summary: { returnPercent: 4.5 },
        }],
        elapsedMs: 100,
    },
    {
        id: "run-2",
        runNumber: 2,
        status: "COMPLETED",
        parameterValues: { smaLength: 20 },
        strategyConfig: { smaLength: 20, direction: "LONG, ONLY" },
        summary: {
            totalTrades: 40,
            winRate: 45,
            returnPercent: -1.5,
            profitFactor: 0.8,
            maxDrawdownPercent: 6,
        },
        detailCounts: {},
        rejectionReasons: { "OUTSIDE, SESSION": 2 },
        periods: [],
        elapsedMs: 80,
    },
    {
        id: "run-3",
        runNumber: 3,
        status: "FAILED",
        parameterValues: { smaLength: 30 },
        strategyConfig: { smaLength: 30, direction: "BOTH" },
        summary: null,
        error: { message: "test failure" },
        periods: [],
    },
];

assert.deepEqual(
    filterRuns(runs, {
        status: "COMPLETED",
        minimumTrades: 50,
        minimumReturnPercent: 0,
        maximumDrawdownPercent: 3,
        minimumProfitFactor: 1.2,
        parameterSearch: "both",
    }).map((run) => run.id),
    ["run-1"]
);

assert.deepEqual(
    filterRuns(runs, { status: "FAILED" }).map((run) => run.id),
    ["run-3"]
);

assert.deepEqual(
    filterRuns(runs, { parameterSearch: "long, only" }).map((run) => run.id),
    ["run-2"]
);

const comparison = createRunComparison(runs.slice(0, 2));
assert.deepEqual(comparison[0].values, ["COMPLETED", "COMPLETED"]);
assert.deepEqual(
    comparison.find((row) => row.key === "parameter.smaLength").values,
    [10, 20]
);
assert.deepEqual(
    comparison.find((row) => row.key === "summary.returnPercent").values,
    [4.5, -1.5]
);

const detail = {
    experiment: {
        id: "experiment-1",
        status: "COMPLETED",
        completedRuns: 2,
        strategy: { id: "simple-sma", name: "Simple SMA" },
        market: {
            instrument: "EUR_USD",
            strategyTimeframe: "M5",
            executionTimeframe: "M5",
            from: "2026-01-01T00:00:00.000Z",
            to: "2026-02-01T00:00:00.000Z",
        },
    },
    runs: runs.slice(0, 2),
};

const csv = createHistoricalRunsCsv(detail);
assert.match(csv, /strategyConfig\.smaLength/);
assert.match(csv, /summary\.returnPercent/);
assert.match(csv, /"LONG, ONLY"/);
assert.match(csv, /"\{""OUTSIDE, SESSION"":2\}"/);

const formulaSafeCsv = createHistoricalRunsCsv({
    ...detail,
    runs: [{ ...runs[0], strategyConfig: { note: "=1+1" } }],
});
assert.match(formulaSafeCsv, /'=1\+1/);

assert.deepEqual(JSON.parse(createHistoricalJson(detail)), detail);
assert.equal(
    createHistoricalExportBaseName(detail.experiment),
    "simple-sma_EUR_USD_M5_2026-01-01_2026-02-01_2-runs"
);

const periods = [
    { type: "MONTH", key: "2026-01", summary: { totalPnlAccount: 20 } },
    { type: "MONTH", key: "2026-02", summary: { totalPnlAccount: -10 } },
    { type: "YEAR", key: "2026", summary: { totalPnlAccount: 10 } },
    { type: "MONTH", key: "2026-03", summary: { totalPnlAccount: null } },
];
const insights = calculatePeriodInsights(periods);

assert.equal(insights.monthlyCount, 2);
assert.equal(insights.yearlyCount, 1);
assert.equal(insights.profitableCount, 1);
assert.equal(insights.profitablePercent, 50);
assert.equal(insights.primaryType, "MONTH");
assert.equal(insights.metricKey, "totalPnlAccount");
assert.equal(insights.best.key, "2026-01");
assert.equal(insights.worst.key, "2026-02");

console.log("Dashboard analysis test passed.");
