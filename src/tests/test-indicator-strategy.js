import assert from "node:assert/strict";

import { runBacktest } from "../backtest/backtest-runner.js";

import {
    createEma,
    crossover,
} from "../indicators/index.js";

const M1 = 60 * 1000;
const start = Date.parse("2026-01-05T10:00:00Z");

function candle(time, bidClose) {
    const spread = 0.0001;

    return {
        time,
        complete: true,
        volume: 1,

        bid: {
            open: bidClose,
            high: bidClose + 0.0002,
            low: bidClose - 0.0002,
            close: bidClose,
        },

        ask: {
            open: bidClose + spread,
            high: bidClose + spread + 0.0002,
            low: bidClose + spread - 0.0002,
            close: bidClose + spread,
        },

        mid: {
            open: bidClose + spread / 2,
            high: bidClose + spread / 2 + 0.0002,
            low: bidClose + spread / 2 - 0.0002,
            close: bidClose + spread / 2,
        },
    };
}

function createIndicatorStrategy() {
    let fast;
    let slow;
    let previousFast;
    let previousSlow;

    function reset() {
        fast = createEma(2);
        slow = createEma(3);

        previousFast = null;
        previousSlow = null;
    }

    reset();

    return {
        name: "INDICATOR_PORT_TEST",

        reset,

        onCandle(context) {
            const close = context.candle.mid.close;
            const fastValue = fast.next(close);
            const slowValue = slow.next(close);

            const crossedUp = crossover(
                previousFast,
                fastValue,
                previousSlow,
                slowValue
            );

            previousFast = fastValue;
            previousSlow = slowValue;

            if (!crossedUp) {
                return null;
            }

            return {
                action: "ENTER",
                side: "LONG",

                size: {
                    type: "UNITS",
                    value: 1000,
                },
            };
        },
    };
}

const strategyCandles = [
    candle(start, 1.1000),
    candle(start + M1, 1.0990),
    candle(start + M1 * 2, 1.0980),
    candle(start + M1 * 3, 1.0990),
    candle(start + M1 * 4, 1.1010),
];

const executionCandles = [
    candle(start + M1, 1.0990),
    candle(start + M1 * 2, 1.0980),
    candle(start + M1 * 3, 1.0990),
    candle(start + M1 * 4, 1.1010),
    candle(start + M1 * 5, 1.1010),
    candle(start + M1 * 6, 1.1020),
];

const result = runBacktest({
    strategyCandles,
    executionCandles,
    strategy: createIndicatorStrategy(),
    pipSize: 0.0001,
    instrument: "EUR_USD",
    strategyTimeframe: "M1",
    executionTimeframe: "M1",

    accountConfig: {
        initialCapital: 10000,
        currency: "USD",
        leverage: 30,
    },

    executionPolicy: {
        closeOpenTradesAtEnd: true,
    },
});

assert.equal(result.signals.length, 1);
assert.equal(result.trades.length, 1);
assert.equal(result.trades[0].side, "LONG");
assert.equal(result.trades[0].exitReason, "END_OF_TEST");
assert.ok(result.trades[0].pnlPips > 0);
assert.ok(result.account.balance > result.account.initialCapital);

console.log("Indicator strategy integration test passed.");
