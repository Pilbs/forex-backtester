import assert from "node:assert/strict";

import { runBacktest } from "../backtest/backtest-runner.js";

const M1 = 60 * 1000;
const start = Date.parse("2026-01-01T10:00:00Z");

function candle(time, bidOpen, bidHigh = bidOpen, bidLow = bidOpen, bidClose = bidOpen) {
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
    executionPolicy = { closeOpenTradesAtEnd: false },
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

function testMultipleOpenTradesAndContext() {
    const strategyCandles = [
        candle(start, 1.0990),
        candle(start + M1, 1.1000),
        candle(start + M1 * 2, 1.1010),
    ];
    const executionCandles = [
        candle(start + M1, 1.1000, 1.1003, 1.0997),
        candle(start + M1 * 2, 1.1010, 1.1013, 1.1007),
        candle(start + M1 * 3, 1.1020, 1.1023, 1.1017),
    ];
    const openTradeCounts = [];

    const strategy = {
        name: "MULTI_TRADE_TEST",
        onCandle(context) {
            openTradeCounts.push(context.openTrades.length);

            if (context.index < 2) {
                return {
                    action: "ENTER",
                    side: "LONG",
                    size: { type: "UNITS", value: 100 },
                };
            }

            return {
                action: "EXIT",
                target: { type: "ALL" },
            };
        },
    };

    const result = run({ strategy, strategyCandles, executionCandles });

    assert.deepEqual(openTradeCounts, [0, 1, 2]);
    assert.equal(result.trades.length, 2);
    assert.equal(result.openTrades.length, 0);
    assert.equal(result.account.position.openTradeCount, 0);
    assert.ok(result.account.balance > result.account.initialCapital);
}

function testPartialExitAndDynamicStop() {
    const strategyCandles = [
        candle(start, 1.0990),
        candle(start + M1, 1.1000),
    ];
    const executionCandles = [
        candle(start + M1, 1.1000, 1.1002, 1.0998),
        candle(start + M1 * 2, 1.1010, 1.1012, 1.1004, 1.1006),
    ];

    const strategy = {
        name: "PARTIAL_EXIT_TEST",
        onCandle(context) {
            if (context.index === 0) {
                return {
                    action: "ENTER",
                    entryId: "entry-1",
                    side: "LONG",
                    size: { type: "UNITS", value: 100 },
                };
            }

            const tradeId = context.openTrades[0].id;

            return [
                {
                    action: "EXIT",
                    target: { type: "TRADE_ID", value: tradeId },
                    size: { type: "PERCENT_POSITION", value: 50 },
                    reason: "SCALE_OUT",
                },
                {
                    action: "UPDATE_STOP",
                    target: { type: "TRADE_ID", value: tradeId },
                    stopLoss: { type: "PRICE", value: 1.1005 },
                },
            ];
        },
    };

    const result = run({ strategy, strategyCandles, executionCandles });
    const trade = result.trades[0];

    assert.equal(result.trades.length, 1);
    assert.equal(trade.originalUnits, 100);
    assert.equal(trade.exitFills.length, 2);
    assert.equal(trade.exitFills[0].units, 50);
    assert.equal(trade.exitFills[0].reason, "SCALE_OUT");
    assert.equal(trade.exitFills[1].units, 50);
    assert.equal(trade.exitFills[1].reason, "STOP_LOSS");
}

function testPendingOrderTypesAndCancellation() {
    const oneStrategyCandle = [candle(start, 1.1000)];

    const limitResult = run({
        strategy: {
            name: "LIMIT_TEST",
            onCandle() {
                return {
                    action: "ENTER",
                    side: "LONG",
                    size: { type: "UNITS", value: 100 },
                    order: { type: "LIMIT", limitPrice: 1.0998 },
                };
            },
        },
        strategyCandles: oneStrategyCandle,
        executionCandles: [
            candle(start + M1, 1.1000, 1.1002, 1.0995),
        ],
    });

    assert.equal(limitResult.orders[0].status, "FILLED");
    assert.equal(limitResult.openTrades[0].entryPrice, 1.0998);

    const stopResult = run({
        strategy: {
            name: "STOP_TEST",
            onCandle() {
                return {
                    action: "ENTER",
                    side: "LONG",
                    size: { type: "UNITS", value: 100 },
                    order: { type: "STOP", stopPrice: 1.1005 },
                };
            },
        },
        strategyCandles: oneStrategyCandle,
        executionCandles: [
            candle(start + M1, 1.1000, 1.1006, 1.0999),
        ],
    });

    assert.equal(stopResult.orders[0].status, "FILLED");
    assert.equal(stopResult.openTrades[0].entryPrice, 1.1005);

    let stopLimitFired = false;
    const stopLimitResult = run({
        strategy: {
            name: "STOP_LIMIT_TEST",
            onCandle() {
                if (stopLimitFired) return null;
                stopLimitFired = true;

                return {
                    action: "ENTER",
                    side: "LONG",
                    size: { type: "UNITS", value: 100 },
                    order: {
                        type: "STOP_LIMIT",
                        stopPrice: 1.1005,
                        limitPrice: 1.1002,
                    },
                };
            },
        },
        strategyCandles: oneStrategyCandle,
        executionCandles: [
            candle(start + M1, 1.1000, 1.1006, 1.0999),
            candle(start + M1 * 2, 1.1003, 1.1005, 1.1000),
        ],
    });

    assert.equal(stopLimitResult.orders[0].status, "FILLED");
    assert.equal(stopLimitResult.openTrades[0].entryPrice, 1.1002);
    assert.ok(stopLimitResult.orders[0].activationTime);

    const cancelResult = run({
        strategy: {
            name: "CANCEL_TEST",
            onCandle(context) {
                if (context.index === 0) {
                    return {
                        action: "ENTER",
                        id: "waiting-order",
                        side: "LONG",
                        size: { type: "UNITS", value: 100 },
                        order: { type: "LIMIT", limitPrice: 1.0900 },
                    };
                }

                return {
                    action: "CANCEL_ORDER",
                    orderId: "waiting-order",
                };
            },
        },
        strategyCandles: [
            candle(start, 1.1000),
            candle(start + M1, 1.1000),
        ],
        executionCandles: [
            candle(start + M1, 1.1000, 1.1002, 1.0998),
            candle(start + M1 * 2, 1.1000, 1.1002, 1.0998),
        ],
    });

    assert.equal(cancelResult.orders[0].status, "CANCELLED");
    assert.equal(cancelResult.orders[0].cancelReason, "STRATEGY_CANCEL");
}

function testNettingMarginAndDrawdownRisk() {
    const nettingResult = run({
        strategy: {
            name: "NETTING_TEST",
            onCandle(context) {
                if (context.index === 0) {
                    return {
                        action: "ENTER",
                        side: "LONG",
                        size: { type: "UNITS", value: 100 },
                    };
                }

                return {
                    action: "ENTER",
                    side: "SHORT",
                    size: { type: "UNITS", value: 150 },
                };
            },
        },
        strategyCandles: [
            candle(start, 1.1000),
            candle(start + M1, 1.1010),
        ],
        executionCandles: [
            candle(start + M1, 1.1000, 1.1002, 1.0998),
            candle(start + M1 * 2, 1.1010, 1.1012, 1.1008),
        ],
        accountConfig: {
            positionMode: "NETTING",
        },
    });

    assert.equal(nettingResult.trades.length, 1);
    assert.equal(nettingResult.openTrades.length, 1);
    assert.equal(nettingResult.openTrades[0].side, "SHORT");
    assert.equal(nettingResult.openTrades[0].remainingUnits, 50);

    const marginResult = run({
        strategy: {
            name: "MARGIN_TEST",
            onCandle() {
                return {
                    action: "ENTER",
                    side: "LONG",
                    size: { type: "UNITS", value: 5000 },
                };
            },
        },
        strategyCandles: [
            candle(start, 1.1000),
            candle(start + M1, 1.1000),
        ],
        executionCandles: [
            candle(start + M1, 1.1000, 1.1001, 1.0999),
            candle(start + M1 * 2, 1.1000, 1.1001, 1.0999),
        ],
        accountConfig: {
            initialCapital: 1000,
            leverage: 10,
            risk: {
                maxMarginUsagePercent: 60,
            },
        },
    });

    assert.equal(marginResult.openTrades.length, 1);
    assert.equal(marginResult.rejectedOrders.length, 1);
    assert.equal(marginResult.rejectedOrders[0].reason, "MAX_MARGIN_USAGE");

    const drawdownResult = run({
        strategy: {
            name: "DRAWDOWN_TEST",
            onCandle() {
                return {
                    action: "ENTER",
                    side: "LONG",
                    size: { type: "UNITS", value: 5000 },
                };
            },
        },
        strategyCandles: [candle(start, 1.1000)],
        executionCandles: [
            candle(start + M1, 1.1000, 1.1001, 1.0800, 1.0800),
            candle(start + M1 * 2, 1.0800, 1.0810, 1.0790, 1.0800),
        ],
        accountConfig: {
            initialCapital: 10000,
            leverage: 30,
            risk: {
                maxDrawdownPercent: 0.5,
                breachAction: "CLOSE_ALL_AND_HALT",
            },
        },
    });

    assert.equal(drawdownResult.account.halted, true);
    assert.equal(drawdownResult.account.haltReason, "MAX_DRAWDOWN");
    assert.equal(drawdownResult.openTrades.length, 0);
    assert.equal(drawdownResult.riskEvents[0].type, "MAX_DRAWDOWN");
}

function testSlippageAndCommission() {
    const result = run({
        strategy: {
            name: "COST_TEST",
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
        },
        strategyCandles: [
            candle(start, 1.0990),
            candle(start + M1, 1.1000),
        ],
        executionCandles: [
            candle(start + M1, 1.1000, 1.1002, 1.0998),
            candle(start + M1 * 2, 1.1010, 1.1012, 1.1008),
        ],
        executionPolicy: {
            closeOpenTradesAtEnd: false,
            slippagePips: 1,
            commission: {
                type: "PIPS_PER_SIDE",
                value: 0.5,
            },
        },
    });

    const trade = result.trades[0];

    assert.ok(Math.abs(trade.entryPrice - 1.1002) < 1e-10);
    assert.ok(Math.abs(trade.exitPrice - 1.1009) < 1e-10);
    assert.equal(trade.pnlPips, 7);
    assert.ok(Math.abs(result.account.totalCommission - 0.1) < 1e-10);
    assert.ok(Math.abs(result.account.balance - 10000.6) < 1e-8);
}

testMultipleOpenTradesAndContext();
testPartialExitAndDynamicStop();
testPendingOrderTypesAndCancellation();
testNettingMarginAndDrawdownRisk();
testSlippageAndCommission();

console.log("Human execution engine test passed.");
