import assert from "node:assert/strict";

import { planResearch } from "../research/run-research.js";
import { assessResearchExecution } from "../cloudflare/research-execution-gate.js";
import { estimateResearchUsage } from "../cloudflare/research-usage-estimate.js";

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
            warningRunCount: 4,
            maximumRunCount: 100,
        },
    };
}

function assess(config) {
    const plan = planResearch(config);
    const usageEstimate = estimateResearchUsage(config, plan);
    return assessResearchExecution(config, plan, usageEstimate);
}

assert.equal(assess(createConfig()).allowed, true);

const tooLong = createConfig();
tooLong.market.to = "2026-09-02T00:00:00Z";
assert.equal(assess(tooLong).allowed, false);
assert.ok(assess(tooLong).reasons.some((reason) => reason.includes("31 days")));

const tooManyRuns = createConfig();
tooManyRuns.parameterGrid.stopLossPips = [8, 10];
assert.equal(assess(tooManyRuns).allowed, false);
assert.ok(assess(tooManyRuns).reasons.some((reason) => reason.includes("4")));

const wrongTimeframe = createConfig();
wrongTimeframe.market.executionTimeframe = "M1";
assert.equal(assess(wrongTimeframe).allowed, false);
assert.ok(assess(wrongTimeframe).reasons.some((reason) => reason.includes("M5")));

console.log("Cloudflare execution gate test passed.");
