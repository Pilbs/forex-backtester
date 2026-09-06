import assert from "node:assert/strict";

import { handleRequest } from "../cloudflare/worker.js";

async function readJson(response) {
    return JSON.parse(await response.text());
}

const healthResponse = await handleRequest(
    new Request("https://example.test/api/health")
);
const health = await readJson(healthResponse);

assert.equal(healthResponse.status, 200);
assert.equal(health.ok, true);
assert.equal(health.executionEnabled, false);

const strategiesResponse = await handleRequest(
    new Request("https://example.test/api/strategies")
);
const strategies = await readJson(strategiesResponse);

assert.equal(strategiesResponse.status, 200);
assert.ok(strategies.strategies.some((strategy) => strategy.id === "orb"));

const config = {
    strategy: "orb",
    market: {
        instrument: "EUR_USD",
        strategyTimeframe: "M5",
        executionTimeframe: "M5",
        from: "2026-08-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
    },
    account: {
        initialCapital: 500,
        currency: "USD",
        leverage: 30,
        positionMode: "HEDGING",
        defaultSizing: {
            type: "CASH",
            value: 300,
        },
    },
    execution: {
        sameCandleConflict: "STOP_FIRST",
        closeOpenTradesAtEnd: true,
    },
    strategyConfig: {
        startHour: 8,
        startMinute: 15,
        durationMinutes: 60,
        timeZone: "America/New_York",
        stopLossPips: 10,
        takeProfitPips: 20,
        entryMode: "ATR_WEIGHTED",
        atrLength: 14,
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    },
    parameterGrid: {
        breakoutSource: ["CLOSE", "WICK"],
        retestSource: ["CLOSE", "WICK"],
    },
    policy: {
        warningRunCount: 25,
        maximumRunCount: 100,
    },
};

const planResponse = await handleRequest(
    new Request("https://example.test/api/plan", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(config),
    })
);
const planned = await readJson(planResponse);

assert.equal(planResponse.status, 200);
assert.equal(planned.plan.research.requestedCombinations, 4);
assert.equal(planned.plan.research.validCombinations, 4);
assert.equal(planned.plan.allowed, true);
assert.ok(planned.usageEstimate.estimatedDatasetRows > 0);
assert.ok(planned.usageEstimate.estimatedCandleEvaluations > planned.usageEstimate.estimatedDatasetRows);

const missingResponse = await handleRequest(
    new Request("https://example.test/api/missing")
);
assert.equal(missingResponse.status, 404);

console.log("Cloudflare research worker test passed.");
