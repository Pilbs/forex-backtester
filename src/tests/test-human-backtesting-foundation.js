import assert from "node:assert/strict";

import {
    createStrategyFromDefinition,
    resolveStrategyConfig,
} from "../strategies/strategy-definition.js";

import {
    normalizeTradeIntents,
    validateTradeIntent,
} from "../strategies/trade-intent.js";

import { resolveAccountConfig } from "../account/account-config.js";
import { calculateEntryUnits } from "../account/position-sizing.js";
import { resolveExecutionPolicy } from "../backtest/execution-policy.js";
import { getInstrumentMetadata } from "../market/instrument-metadata.js";

function expectError(fn, messagePart) {
    let error = null;

    try {
        fn();
    } catch (caught) {
        error = caught;
    }

    assert.ok(error, `Expected error containing: ${messagePart}`);
    assert.match(error.message, new RegExp(messagePart));
}

const definition = {
    id: "test-strategy",
    name: "Test Strategy",
    version: 1,

    parameters: {
        fastLength: {
            type: "integer",
            default: 10,
            min: 1,
        },

        slowLength: {
            type: "integer",
            required: true,
            min: 2,
        },

        useFilter: {
            type: "boolean",
            default: true,
        },
    },

    validateConfig(config) {
        return config.fastLength >= config.slowLength
            ? ["fastLength must be lower than slowLength"]
            : [];
    },

    createStrategy(config) {
        return {
            name: "Test Strategy",
            config,

            onCandle() {
                return null;
            },
        };
    },
};

const resolvedConfig = resolveStrategyConfig({
    strategyDefinition: definition,

    strategyConfig: {
        slowLength: 30,
    },
});

assert.deepEqual(resolvedConfig, {
    fastLength: 10,
    slowLength: 30,
    useFilter: true,
});

const created = createStrategyFromDefinition({
    strategyDefinition: definition,

    strategyConfig: {
        fastLength: 12,
        slowLength: 30,
    },
});

assert.equal(created.strategy.name, "Test Strategy");
assert.equal(created.strategyConfig.fastLength, 12);

expectError(
    () => resolveStrategyConfig({
        strategyDefinition: definition,

        strategyConfig: {
            slowLength: 30,
            mysteryParameter: 123,
        },
    }),
    "Unsupported strategy parameter"
);

expectError(
    () => resolveStrategyConfig({
        strategyDefinition: definition,

        strategyConfig: {
            fastLength: 40,
            slowLength: 30,
        },
    }),
    "fastLength must be lower"
);

validateTradeIntent({
    action: "ENTER",
    side: "LONG",

    stopLoss: {
        type: "PIPS",
        value: 10,
    },

    takeProfit: {
        type: "PIPS",
        value: 20,
    },
});

validateTradeIntent({
    action: "ENTER",
    entryId: "breakout-1",
    side: "SHORT",

    order: {
        type: "STOP_LIMIT",
        stopPrice: 1.1000,
        limitPrice: 1.0998,
        timeInForce: "GTC",
    },

    size: {
        type: "RISK_PERCENT",
        value: 1,
    },

    stopLoss: {
        type: "PRICE",
        value: 1.1020,
    },
});

validateTradeIntent({
    action: "EXIT",

    target: {
        type: "TRADE_ID",
        value: "trade-123",
    },

    size: {
        type: "PERCENT_POSITION",
        value: 50,
    },
});

validateTradeIntent({
    action: "UPDATE_STOP",

    target: {
        type: "ENTRY_ID",
        value: "breakout-1",
    },

    stopLoss: {
        type: "PRICE",
        value: 1.1010,
    },
});

validateTradeIntent({
    action: "UPDATE_TARGET",

    target: {
        type: "ALL",
    },

    takeProfit: null,
});

validateTradeIntent({
    action: "CANCEL_ORDER",
    all: true,
});

const normalized = normalizeTradeIntents([
    {
        action: "EXIT",

        target: {
            type: "SIDE",
            value: "LONG",
        },
    },

    {
        action: "CANCEL_ORDER",
        orderId: "order-1",
    },
]);

assert.equal(normalized.length, 2);

expectError(
    () => validateTradeIntent({
        action: "ENTER",
        side: "LONG",

        order: {
            type: "LIMIT",
        },
    }),
    "limitPrice"
);

const accountConfig = resolveAccountConfig({
    initialCapital: 25000,
    currency: "GBP",
    leverage: 20,
    positionMode: "HEDGING",

    defaultSizing: {
        type: "RISK_PERCENT",
        value: 1,
    },

    risk: {
        maxOpenTrades: 5,
        maxDrawdownPercent: 20,
    },
});

assert.equal(accountConfig.initialCapital, 25000);
assert.equal(accountConfig.risk.maxOpenTrades, 5);
assert.equal(accountConfig.risk.maxMarginUsagePercent, 100);

const units = calculateEntryUnits({
    size: {
        type: "RISK_PERCENT",
        value: 1,
    },

    entryPrice: 1.1000,
    stopLossPrice: 1.0950,
    equity: 10000,
    quoteToAccountRate: 1,
    unitStep: 1,
    minimumUnits: 1,
});

assert.equal(units, 20000);

const executionPolicy = resolveExecutionPolicy({
    sameCandleConflict: "STOP_FIRST",
    slippagePips: 0.2,

    commission: {
        type: "PIPS_PER_SIDE",
        value: 0.1,
    },
});

assert.equal(executionPolicy.slippagePips, 0.2);
assert.equal(executionPolicy.commission.type, "PIPS_PER_SIDE");

const eurUsd = getInstrumentMetadata("EUR_USD");

assert.equal(eurUsd.baseCurrency, "EUR");
assert.equal(eurUsd.quoteCurrency, "USD");
assert.equal(eurUsd.pipSize, 0.0001);

console.log("Human backtesting foundation test passed.");