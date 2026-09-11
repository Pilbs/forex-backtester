import assert from "node:assert/strict";

import { planResearch } from "../research/run-research.js";
import {
    assessResearchExecution,
    COMMISSIONING_LIMITS,
} from "../cloudflare/research-execution-gate.js";
import { estimateResearchUsage } from "../cloudflare/research-usage-estimate.js";

function createOrbConfig() {
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
            maximumRunCount: 100,
        },
    };
}

function createSimpleSmaConfig() {
    const config = createOrbConfig();
    config.strategy = "simple-sma";
    config.strategyConfig = {
        smaLength: 20,
    };
    config.parameterGrid = {
        smaLength: [10, 20],
    };
    return config;
}

function assess(config) {
    const plan = planResearch(config);
    const usageEstimate = estimateResearchUsage(config, plan);
    return assessResearchExecution(config, plan, usageEstimate);
}

assert.deepEqual(COMMISSIONING_LIMITS.strategies, ["simple-sma", "orb"]);
assert.equal(assess(createOrbConfig()).allowed, true);
assert.equal(assess(createSimpleSmaConfig()).allowed, true);

const tooLong = createOrbConfig();
tooLong.market.to = "2027-08-02T00:00:00Z";
assert.equal(assess(tooLong).allowed, false);
assert.ok(
    assess(tooLong).reasons.some((reason) =>
        reason.includes(`${COMMISSIONING_LIMITS.maximumDateRangeDays} days`)
    )
);

const tooManyRuns = createOrbConfig();
tooManyRuns.parameterGrid.stopLossValue = [10, 12];
assert.equal(assess(tooManyRuns).allowed, false);
assert.ok(
    assess(tooManyRuns).reasons.some((reason) =>
        reason.includes(String(COMMISSIONING_LIMITS.maximumRuns))
    )
);

const wrongTimeframe = createOrbConfig();
wrongTimeframe.market.executionTimeframe = "M1";
assert.equal(assess(wrongTimeframe).allowed, false);
assert.ok(
    assess(wrongTimeframe).reasons.some((reason) =>
        reason.includes(COMMISSIONING_LIMITS.executionTimeframe)
    )
);

console.log("Cloudflare execution gate test passed.");
