import assert from "node:assert/strict";
import { estimateResearchUsage } from "../cloudflare/research-usage-estimate.js";

function makeConfig({
    from,
    to,
    instrument = "EUR_USD",
    strategyTimeframe = "M1",
    executionTimeframe = "M1",
} = {}) {
    return {
        market: {
            instrument,
            strategyTimeframe,
            executionTimeframe,
            from,
            to,
        },
    };
}

function makePlan(validCombinations = 1) {
    return {
        research: {
            requestedCombinations: validCombinations,
            validCombinations,
        },
    };
}

// One full FX trading week: Sunday 17:00 New York to the following Sunday
// 17:00 New York. The estimator should count 5 x 24 hours, not 7 x 24.
{
    const usage = estimateResearchUsage(
        makeConfig({
            from: "2025-08-03T21:00:00.000Z",
            to: "2025-08-10T21:00:00.000Z",
        }),
        makePlan(4)
    );

    assert.equal(usage.estimatedStrategyRows, 7200);
    assert.equal(usage.estimatedDatasetRows, 7200);
    assert.equal(usage.estimatedCandleEvaluations, 28800);
}

// Closed weekend time should not add estimated candles.
{
    const usage = estimateResearchUsage(
        makeConfig({
            from: "2025-08-02T00:00:00.000Z",
            to: "2025-08-03T20:59:00.000Z",
        }),
        makePlan(1)
    );

    assert.equal(usage.estimatedStrategyRows, 0);
}

// Sunday open is 17:00 New York (21:00 UTC while EDT is active).
{
    const usage = estimateResearchUsage(
        makeConfig({
            from: "2025-08-03T20:00:00.000Z",
            to: "2025-08-03T22:00:00.000Z",
        }),
        makePlan(1)
    );

    assert.equal(usage.estimatedStrategyRows, 60);
}

// Non-FX fallback keeps the original continuous-market estimate.
{
    const usage = estimateResearchUsage(
        makeConfig({
            instrument: "TEST_MARKET",
            from: "2025-08-02T00:00:00.000Z",
            to: "2025-08-03T00:00:00.000Z",
        }),
        makePlan(1)
    );

    assert.equal(usage.estimatedStrategyRows, 1440);
}

console.log("Research usage estimate tests passed.");
