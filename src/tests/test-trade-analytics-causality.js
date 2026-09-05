import assert from "node:assert/strict";

import {
    runBacktestWithDataset,
} from "../backtest/backtest-service.js";

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

function dataset({
    strategyCandles,
    executionCandles,
}) {
    return {
        config: {
            instrument: "EUR_USD",
            strategyTimeframe: "M1",
            executionTimeframe: "M1",
            pipSize: 0.0001,
            baseCurrency: "EUR",
            quoteCurrency: "USD",
            from: new Date(start).toISOString(),
            to: new Date(start + M1 * 10).toISOString(),
        },

        data: {
            strategyCandleCount: strategyCandles.length,
            executionCandleCount: executionCandles.length,
            firstStrategyCandleTime: strategyCandles[0]?.time ?? null,
            lastStrategyCandleTime: strategyCandles.at(-1)?.time ?? null,
            firstExecutionCandleTime: executionCandles[0]?.time ?? null,
            lastExecutionCandleTime: executionCandles.at(-1)?.time ?? null,
        },

        strategyCandles,
        executionCandles,
    };
}

function run({
    strategy,
    strategyCandles,
    executionCandles,
    closeOpenTradesAtEnd = true,
}) {
    return runBacktestWithDataset({
        dataset: dataset({
            strategyCandles,
            executionCandles,
        }),

        strategy,

        accountConfig: {
            initialCapital: 10000,
            currency: "USD",
            leverage: 30,
        },

        executionPolicy: {
            sameCandleConflict: "STOP_FIRST",
            closeOpenTradesAtEnd,
        },
    });
}

function testProtectiveExitDoesNotLeakPostExitExtrema() {
    let fired = false;

    const result = run({
        strategy: {
            name: "PROTECTIVE_EXIT_CAUSALITY",

            reset() {
                fired = false;
            },

            onCandle() {
                if (fired) {
                    return null;
                }

                fired = true;

                return {
                    action: "ENTER",
                    side: "LONG",

                    size: {
                        type: "UNITS",
                        value: 1000,
                    },

                    takeProfit: {
                        type: "PIPS",
                        value: 10,
                    },
                };
            },
        },

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
                bidHigh: 1.1050,
                bidLow: 1.0995,
                bidClose: 1.1040,
            }),
        ],
    });

    assert.equal(result.trades.length, 1);

    const trade = result.trades[0];

    assert.equal(trade.exitReason, "TAKE_PROFIT");
    assert.equal(trade.pnlPips, 10);
    assert.equal(trade.mfePips, 10);
    assert.equal(trade.maePips, 0);
    assert.equal(trade.excursionMethod, "CAUSAL_CONSERVATIVE");
    assert.equal(Object.hasOwn(trade, "unrealizedPips"), false);
}

function testIntrabarEntryDoesNotUsePreEntryExtrema() {
    let fired = false;

    const result = run({
        strategy: {
            name: "INTRABAR_ENTRY_CAUSALITY",

            reset() {
                fired = false;
            },

            onCandle() {
                if (fired) {
                    return null;
                }

                fired = true;

                return {
                    action: "ENTER",
                    side: "LONG",

                    size: {
                        type: "UNITS",
                        value: 1000,
                    },

                    order: {
                        type: "LIMIT",
                        limitPrice: 1.0990,
                    },
                };
            },
        },

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
                bidHigh: 1.1100,
                bidLow: 1.0988,
                bidClose: 1.0992,
            }),
        ],
    });

    assert.equal(result.trades.length, 1);

    const trade = result.trades[0];

    assert.equal(trade.entryPrice, 1.0990);
    assert.equal(trade.exitReason, "END_OF_TEST");
    assert.ok(trade.pnlPips > 0);
    assert.ok(trade.pnlPips < 3);
    assert.equal(trade.mfePips, trade.pnlPips);
    assert.equal(trade.maePips, 0);
}

testProtectiveExitDoesNotLeakPostExitExtrema();
testIntrabarEntryDoesNotUsePreEntryExtrema();

console.log("Trade analytics causality test passed.");
