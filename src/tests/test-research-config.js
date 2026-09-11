import { normalizeResearchConfig } from "../research/research-config.js";

const config = normalizeResearchConfig({
    strategy: "orb",

    market: {
        instrument: "EUR_USD",
        strategyTimeframe: "M5",
        executionTimeframe: "M5",
        from: "2026-06-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
    },

    account: {
        initialCapital: 500,
        currency: "USD",
    },

    execution: {
        sameCandleConflict: "STOP_FIRST",
    },

    strategyConfig: {
        orbStartHour: 8,
        orbStartMinute: 15,
        orbDurationMinutes: 60,
        timezoneMode: "EXCHANGE",
        stopLossMode: "PERCENT",
        stopLossValue: 0.20,
        takeProfitMode: "ATR",
        takeProfitValue: 3,
    },

    parameterGrid: {
        breakoutCondition: ["CLOSE", "WICK"],
        requiredRetests: [0, 1],
    },
});

if (config.strategy !== "orb") {
    throw new Error("Research config strategy was not normalized");
}

if (config.market.instrument !== "EUR_USD") {
    throw new Error("Research config market section was not preserved");
}

if (config.parameterGrid.breakoutCondition.length !== 2) {
    throw new Error("Research config parameter grid was not preserved");
}

if (Object.keys(config.policy).length !== 0) {
    throw new Error("Missing optional research policy should resolve to an empty object");
}

let unknownStrategyRejected = false;
try {
    normalizeResearchConfig({
        strategy: "missing",
        market: {},
    });
} catch {
    unknownStrategyRejected = true;
}

if (!unknownStrategyRejected) {
    throw new Error("Unknown research strategy was not rejected");
}

let unknownParameterRejected = false;
try {
    normalizeResearchConfig({
        strategy: "orb",
        market: {},
        strategyConfig: {
            madeUpParameter: 123,
        },
    });
} catch {
    unknownParameterRejected = true;
}

if (!unknownParameterRejected) {
    throw new Error("Unknown strategyConfig parameter was not rejected");
}

let invalidGridRejected = false;
try {
    normalizeResearchConfig({
        strategy: "orb",
        market: {},
        parameterGrid: {
            stopLossValue: 0.20,
        },
    });
} catch {
    invalidGridRejected = true;
}

if (!invalidGridRejected) {
    throw new Error("Non-array parameter grid value was not rejected");
}

console.log("Research config test passed.");
