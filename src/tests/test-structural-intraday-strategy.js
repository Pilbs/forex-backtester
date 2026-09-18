import assert from "node:assert/strict";

import {
    createStructuralIntradayStrategy,
    isLondonNewYorkOverlap,
} from "../strategies/structural-intraday/structural-intraday-strategy.js";

const MINUTE = 60 * 1000;
const START = Date.parse("2026-01-05T00:00:00Z");

function at(hour, minute = 0) {
    return START + (hour * 60 + minute) * MINUTE;
}

function candle(time, {
    open = 1.1000,
    high = 1.1002,
    low = 1.0998,
    close = 1.1000,
} = {}) {
    return {
        time,
        mid: {
            open,
            high,
            low,
            close,
        },
    };
}

function context(item, openTrades = [], timeframe = "M1") {
    return {
        candle: item,
        timeframe,
        instrument: "EUR_USD",
        openTrades,
        pendingOrders: [],
    };
}

assert.equal(isLondonNewYorkOverlap(at(13, 15)), true);
assert.equal(isLondonNewYorkOverlap(at(12, 15)), false);

const strategy = createStructuralIntradayStrategy({
    longEnabled: true,
    shortEnabled: false,
    h1AtrLength: 2,
    longH1RangeLookbackHours: 2,
    longRangePositionMin: 0,
    longRangePositionMax: 1,
    longTriggerType: "MICRO_BREAKOUT_15M",
    cooldownMinutes: 0,
    maxHoldMinutes: 60,
});

strategy.onCandle(context(candle(at(10), {
    high: 1.1020,
    low: 1.0980,
})));

strategy.onCandle(context(candle(at(11), {
    high: 1.1020,
    low: 1.0980,
})));

for (let minute = 45; minute < 60; minute++) {
    strategy.onCandle(context(candle(at(12, minute), {
        high: 1.1010,
        low: 1.0990,
    })));
}

for (let minute = 0; minute < 15; minute++) {
    strategy.onCandle(context(candle(at(13, minute))));
}

const entry = strategy.onCandle(context(candle(at(13, 15), {
    open: 1.1000,
    high: 1.1012,
    low: 1.0999,
    close: 1.1010,
})));

assert.equal(entry?.action, "ENTER");
assert.equal(entry?.side, "LONG");
assert.equal(entry?.reason, "STRUCTURAL_M1_TRIGGER");
assert.equal(entry?.metadata?.trigger?.type, "MICRO_BREAKOUT_15M");

const openTrade = [{
    id: "trade-1",
    side: "LONG",
    entryTime: at(13, 16),
    entryPrice: 1.1010,
}];

const beforeExit = strategy.onCandle(
    context(candle(at(14, 14)), openTrade)
);
assert.equal(beforeExit, null);

const exit = strategy.onCandle(
    context(candle(at(14, 15)), openTrade)
);

assert.equal(exit?.action, "EXIT");
assert.equal(exit?.reason, "STRUCTURAL_MAX_HOLD");
assert.deepEqual(exit?.target, {
    type: "TRADE_ID",
    value: "trade-1",
});

const wrongTimeframeStrategy = createStructuralIntradayStrategy();

assert.throws(
    () => wrongTimeframeStrategy.onCandle(
        context(candle(at(13, 15)), [], "M5")
    ),
    /requires M1/
);

console.log("Structural Intraday strategy test passed.");
