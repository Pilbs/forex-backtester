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

const genericSpec = {
    version: 1,
    name: "RSI + EMA test",
    side: "LONG",
    entry: {
        logic: "AND",
        conditions: [
            {
                type: "RSI_THRESHOLD",
                period: 14,
                operator: "BELOW",
                value: 30,
            },
            {
                type: "EMA_CROSS",
                fastPeriod: 10,
                slowPeriod: 30,
                direction: "ABOVE",
            },
        ],
    },
};

const genericConfig = normalizeResearchConfig({
    strategy: "generic",
    strategySpec: genericSpec,
    market: {
        instrument: "EUR_USD",
        strategyTimeframe: "M5",
        executionTimeframe: "M5",
        from: "2026-06-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
    },
});

if (genericConfig.strategy !== "generic") {
    throw new Error("Generic research strategy was not normalized");
}

if (genericConfig.strategySpec !== genericSpec) {
    throw new Error("Generic strategySpec was not preserved");
}

let missingGenericSpecRejected = false;
try {
    normalizeResearchConfig({
        strategy: "generic",
        market: {},
    });
} catch {
    missingGenericSpecRejected = true;
}

if (!missingGenericSpecRejected) {
    throw new Error("Missing generic strategySpec was not rejected");
}

let invalidGenericSpecRejected = false;
try {
    normalizeResearchConfig({
        strategy: "generic",
        strategySpec: {
            version: 1,
            entry: {
                conditions: [{ type: "NOT_REAL" }],
            },
        },
        market: {},
    });
} catch {
    invalidGenericSpecRejected = true;
}

if (!invalidGenericSpecRejected) {
    throw new Error("Invalid generic strategySpec was not rejected");
}

let unexpectedStrategySpecRejected = false;
try {
    normalizeResearchConfig({
        strategy: "orb",
        strategySpec: genericSpec,
        market: {},
    });
} catch {
    unexpectedStrategySpecRejected = true;
}

if (!unexpectedStrategySpecRejected) {
    throw new Error("strategySpec on a registered strategy was not rejected");
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
