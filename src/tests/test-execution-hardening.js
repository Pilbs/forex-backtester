import assert from "node:assert/strict";

import {
    runBacktest,
} from "../backtest/backtest-runner.js";

const M1 = 60 * 1000;
const start = Date.parse("2026-01-05T10:00:00Z");

function candle({
    time,
    bidOpen,
    bidHigh = bidOpen,
    bidLow = bidOpen,
    bidClose = bidOpen,
}) {
    const spread = 0.0001;

    return {
        time,
        complete: true,
        volume: 1,

        bid: {
            open: bidOpen,
            high: bidHigh,
            low: bidLow,
            close: bidClose,
        },

        ask: {
            open: bidOpen + spread,
            high: bidHigh + spread,
            low: bidLow + spread,
            close: bidClose + spread,
        },

        mid: {
            open: bidOpen + spread / 2,
            high: bidHigh + spread / 2,
            low: bidLow + spread / 2,
            close: bidClose + spread / 2,
        },
    };
}

function run({
    strategy,
    strategyCandles,
    executionCandles,
    accountConfig = {},
    executionPolicy = {},
}) {
    return runBacktest({
        strategyCandles,
        executionCandles,
        strategy,
        pipSize: 0.0001,
        instrument: "EUR_USD",
        strategyTimeframe: "M1",
        executionTimeframe: "M1",
        accountConfig,
        executionPolicy,
    });
}

function oneShotStrategy(intent) {
    let fired = false;

    return {
        name: "HARDENING_TEST",

        reset() {
            fired = false;
        },

        onCandle() {
            if (fired) {
                return null;
            }

            fired = true;
            return intent;
        },
    };
}

function testSameCandleConflictPolicy() {
    const strategyCandles = [
        candle({
            time: start,
            bidOpen: 1.1000,
        }),
    ];

    const executionCandles = [
        candle({
            time: start + M1,
            bidOpen: 1.1000,
            bidHigh: 1.1012,
            bidLow: 1.0990,
            bidClose: 1.1000,
        }),
    ];

    const intent = {
        action: "ENTER",
        side: "LONG",
        size: { type: "UNITS", value: 1000 },
        stopLoss: { type: "PIPS", value: 10 },
        takeProfit: { type: "PIPS", value: 10 },
    };

    const stopFirst = run({
        strategy: oneShotStrategy(intent),
        strategyCandles,
        executionCandles,
        executionPolicy: {
            sameCandleConflict: "STOP_FIRST",
        },
    });

    const targetFirst = run({
        strategy: oneShotStrategy(intent),
        strategyCandles,
        executionCandles,
        executionPolicy: {
            sameCandleConflict: "TARGET_FIRST",
        },
    });

    assert.equal(stopFirst.trades[0].exitReason, "STOP_LOSS");
    assert.equal(targetFirst.trades[0].exitReason, "TAKE_PROFIT");
}

function testIntrabarEntryDefersProtection() {
    const strategyCandles = [
        candle({
            time: start,
            bidOpen: 1.1000,
        }),
    ];

    const executionCandles = [
        candle({
            time: start + M1,
            bidOpen: 1.1000,
            bidHigh: 1.1002,
            bidLow: 1.0990,
            bidClose: 1.0999,
        }),

        candle({
            time: start + M1 * 2,
            bidOpen: 1.0999,
            bidHigh: 1.1000,
            bidLow: 1.0995,
            bidClose: 1.0996,
        }),
    ];

    const result = run({
        strategy: oneShotStrategy({
            action: "ENTER",
            side: "LONG",
            size: { type: "UNITS", value: 1000 },

            order: {
                type: "LIMIT",
                limitPrice: 1.0998,
            },

            stopLoss: {
                type: "PIPS",
                value: 2,
            },
        }),

        strategyCandles,
        executionCandles,
    });

    assert.equal(result.trades.length, 1);
    assert.equal(result.trades[0].entryPrice, 1.0998);
    assert.equal(result.trades[0].exitReason, "STOP_LOSS");
    assert.equal(result.trades[0].exitTime, start + M1 * 2);
}

function testStopLimitActivationIsConservative() {
    const strategyCandles = [
        candle({
            time: start,
            bidOpen: 1.1000,
        }),
    ];

    const executionCandles = [
        candle({
            time: start + M1,
            bidOpen: 1.1000,
            bidHigh: 1.1006,
            bidLow: 1.0999,
            bidClose: 1.1003,
        }),

        candle({
            time: start + M1 * 2,
            bidOpen: 1.1003,
            bidHigh: 1.1005,
            bidLow: 1.1000,
            bidClose: 1.1002,
        }),
    ];

    const result = run({
        strategy: oneShotStrategy({
            action: "ENTER",
            side: "LONG",
            size: { type: "UNITS", value: 1000 },

            order: {
                type: "STOP_LIMIT",
                stopPrice: 1.1005,
                limitPrice: 1.1002,
            },
        }),

        strategyCandles,
        executionCandles,

        executionPolicy: {
            closeOpenTradesAtEnd: false,
        },
    });

    assert.equal(result.orders[0].status, "FILLED");
    assert.equal(result.orders[0].activationTime, start + M1);
    assert.equal(result.orders[0].fillTime, start + M1 * 2);
    assert.equal(result.openTrades.length, 1);
}

function testIocCancellation() {
    const result = run({
        strategy: oneShotStrategy({
            action: "ENTER",
            side: "LONG",
            size: { type: "UNITS", value: 1000 },

            order: {
                type: "LIMIT",
                limitPrice: 1.0900,
                timeInForce: "IOC",
            },
        }),

        strategyCandles: [
            candle({
                time: start,
                bidOpen: 1.1000,
            }),
        ],

        executionCandles: [
            candle({
                time: start + M1,
                bidOpen: 1.1000,
                bidHigh: 1.1002,
                bidLow: 1.0998,
            }),
        ],
    });

    assert.equal(result.orders[0].status, "CANCELLED");
    assert.equal(result.orders[0].cancelReason, "IOC_UNFILLED");
}

function testFixedQuoteConversion() {
    const strategy = {
        name: "CURRENCY_CONVERSION_TEST",

        onCandle(context) {
            if (context.index === 0) {
                return {
                    action: "ENTER",
                    side: "LONG",
                    size: { type: "UNITS", value: 1000 },
                };
            }

            return {
                action: "EXIT",
                target: { type: "ALL" },
            };
        },
    };

    const result = run({
        strategy,

        strategyCandles: [
            candle({
                time: start,
                bidOpen: 1.1000,
            }),
            candle({
                time: start + M1,
                bidOpen: 1.1000,
            }),
        ],

        executionCandles: [
            candle({
                time: start + M1,
                bidOpen: 1.1000,
            }),
            candle({
                time: start + M1 * 2,
                bidOpen: 1.1010,
            }),
        ],

        accountConfig: {
            initialCapital: 10000,
            currency: "GBP",
            quoteToAccountRate: 0.75,
            leverage: 30,
        },

        executionPolicy: {
            closeOpenTradesAtEnd: false,
        },
    });

    assert.equal(result.trades.length, 1);
    assert.ok(Math.abs(result.account.balance - 10000.675) < 1e-9);
}

testSameCandleConflictPolicy();
testIntrabarEntryDefersProtection();
testStopLimitActivationIsConservative();
testIocCancellation();
testFixedQuoteConversion();

console.log("Execution hardening test passed.");
