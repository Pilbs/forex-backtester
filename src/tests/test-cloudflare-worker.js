import assert from "node:assert/strict";

import { handleRequest } from "../cloudflare/worker.js";

async function readJson(response) {
    return JSON.parse(await response.text());
}

function createConfig() {
    return {
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
            orbStartHour: 8,
            orbStartMinute: 15,
            orbDurationMinutes: 60,
            timezoneMode: "EXCHANGE",
            atrLength: 12,
            stopLossMode: "PIPS",
            stopLossValue: 10,
            takeProfitMode: "PIPS",
            takeProfitValue: 20,
        },
        parameterGrid: {
            breakoutCondition: ["CLOSE", "WICK"],
            requiredRetests: [0, 1],
        },
        policy: {
            warningRunCount: 4,
            maximumRunCount: 4,
        },
    };
}

const healthResponse = await handleRequest(
    new Request("https://example.test/api/health")
);
const health = await readJson(healthResponse);

assert.equal(healthResponse.status, 200);
assert.equal(health.ok, true);
assert.equal(health.executionEnabled, true);
assert.equal(health.executionMode, "COMMISSIONING");
assert.equal(health.d1Bound, false);

const strategiesResponse = await handleRequest(
    new Request("https://example.test/api/strategies")
);
const strategies = await readJson(strategiesResponse);

assert.equal(strategiesResponse.status, 200);
assert.ok(strategies.strategies.some((strategy) => strategy.id === "orb"));

const orbMetadata = strategies.strategies.find((strategy) => strategy.id === "orb");
assert.ok(orbMetadata.parameters.some((parameter) => parameter.id === "breakoutCondition"));
assert.ok(!orbMetadata.parameters.some((parameter) => parameter.id === "entryMode"));

const config = createConfig();
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
assert.equal(planned.executionGate.allowed, true);
assert.ok(planned.usageEstimate.estimatedDatasetRows > 0);

const executionWithoutD1 = await handleRequest(
    new Request("https://example.test/api/experiments", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(config),
    })
);
const missingD1 = await readJson(executionWithoutD1);

assert.equal(executionWithoutD1.status, 503);
assert.match(missingD1.error, /FOREX_DB/);

const blockedConfig = createConfig();
blockedConfig.market.executionTimeframe = "M1";
const blockedResponse = await handleRequest(
    new Request("https://example.test/api/experiments", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(blockedConfig),
    })
);
const blocked = await readJson(blockedResponse);

assert.equal(blockedResponse.status, 422);
assert.equal(blocked.executionGate.allowed, false);

const missingResponse = await handleRequest(
    new Request("https://example.test/api/missing")
);
assert.equal(missingResponse.status, 404);

console.log("Cloudflare research worker test passed.");
