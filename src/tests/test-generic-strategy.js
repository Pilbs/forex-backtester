import assert from "node:assert/strict";
import { createGenericStrategy } from "../strategies/generic/generic-strategy.js";
import { validateStrategy } from "../strategies/strategy-interface.js";

function candle(close) {
    return {
        mid: {
            open: close,
            high: close,
            low: close,
            close,
        },
    };
}

function context(close, openTrades = []) {
    return {
        candle: candle(close),
        openTrades,
    };
}

const rsiStrategy = createGenericStrategy({
    definition: {
        version: 1,
        name: "RSI Example",
        side: "LONG",
        entry: {
            logic: "AND",
            conditions: [
                {
                    type: "RSI_THRESHOLD",
                    period: 2,
                    operator: "BELOW",
                    value: 30,
                },
            ],
        },
        exit: {
            logic: "AND",
            conditions: [
                {
                    type: "RSI_THRESHOLD",
                    period: 2,
                    operator: "ABOVE",
                    value: 70,
                },
            ],
        },
    },
});

validateStrategy(rsiStrategy);
rsiStrategy.reset();

assert.equal(rsiStrategy.onCandle(context(100)), null);
assert.equal(rsiStrategy.onCandle(context(99)), null);
const rsiEntry = rsiStrategy.onCandle(context(98));
assert.equal(rsiEntry?.action, "ENTER");
assert.equal(rsiEntry?.side, "LONG");

const openLong = [{ side: "LONG" }];
assert.equal(rsiStrategy.onCandle(context(100, openLong)), null);
const rsiExit = rsiStrategy.onCandle(context(102, openLong));
assert.equal(rsiExit?.action, "EXIT");
assert.equal(rsiExit?.target?.value, "LONG");

const emaStrategy = createGenericStrategy({
    definition: {
        version: 1,
        name: "EMA Cross Example",
        side: "LONG",
        entry: {
            logic: "AND",
            conditions: [
                {
                    type: "EMA_CROSS",
                    fastPeriod: 2,
                    slowPeriod: 3,
                    direction: "ABOVE",
                },
            ],
        },
    },
});

validateStrategy(emaStrategy);
emaStrategy.reset();

let emaEntry = null;
for (const close of [10, 9, 8, 9, 10, 11]) {
    emaEntry = emaStrategy.onCandle(context(close));
    if (emaEntry) break;
}

assert.equal(emaEntry?.action, "ENTER");
assert.equal(emaEntry?.side, "LONG");

const combinedStrategy = createGenericStrategy({
    definition: {
        version: 1,
        side: "LONG",
        entry: {
            logic: "AND",
            conditions: [
                {
                    type: "RSI_THRESHOLD",
                    period: 2,
                    operator: "BELOW",
                    value: 100,
                },
                {
                    type: "EMA_CROSS",
                    fastPeriod: 2,
                    slowPeriod: 3,
                    direction: "ABOVE",
                },
            ],
        },
    },
});

validateStrategy(combinedStrategy);
combinedStrategy.reset();

let combinedEntry = null;
for (const close of [10, 9, 8, 9, 10, 11]) {
    combinedEntry = combinedStrategy.onCandle(context(close));
    if (combinedEntry) break;
}

assert.equal(combinedEntry?.action, "ENTER");

const riskStrategy = createGenericStrategy({
    definition: {
        version: 1,
        side: "LONG",
        risk: {
            stopLossPips: 12,
            takeProfitPips: 24,
        },
        entry: {
            logic: "AND",
            conditions: [
                {
                    type: "RSI_THRESHOLD",
                    period: 2,
                    operator: "BELOW",
                    value: 30,
                },
            ],
        },
    },
});

riskStrategy.reset();
riskStrategy.onCandle(context(100));
riskStrategy.onCandle(context(99));
const riskEntry = riskStrategy.onCandle(context(98));
assert.equal(riskEntry?.stopLoss?.type, "PIPS");
assert.equal(riskEntry?.stopLoss?.value, 12);
assert.equal(riskEntry?.takeProfit?.type, "PIPS");
assert.equal(riskEntry?.takeProfit?.value, 24);

assert.throws(
    () => createGenericStrategy({
        definition: {
            version: 1,
            entry: {
                conditions: [{ type: "NOT_REAL" }],
            },
        },
    }),
    /Unsupported generic condition type/
);

console.log("Generic strategy tests passed.");
