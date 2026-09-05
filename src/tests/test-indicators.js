import assert from "node:assert/strict";

import {
    createAtr,
    createEma,
    createRma,
    createRollingHighest,
    createRollingLowest,
    createRollingStandardDeviation,
    createRsi,
    createSma,
    crossover,
    crossunder,
    pivotHigh,
    pivotLow,
    trueRange,
} from "../indicators/index.js";

function approximately(actual, expected, tolerance = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `Expected ${actual} to be approximately ${expected}`
    );
}

const sma = createSma(3);
assert.deepEqual(
    [1, 2, 3, 4].map((value) => sma.next(value)),
    [null, null, 2, 3]
);
sma.reset();
assert.equal(sma.value, null);

const ema = createEma(3);
assert.equal(ema.next(1), null);
assert.equal(ema.next(2), null);
assert.equal(ema.next(3), 2);
assert.equal(ema.next(4), 3);

const rma = createRma(3);
assert.equal(rma.next(1), null);
assert.equal(rma.next(2), null);
assert.equal(rma.next(3), 2);
approximately(rma.next(4), 2 + 2 / 3);

assert.equal(
    trueRange({
        high: 13,
        low: 10,
        previousClose: 10,
    }),
    3
);

function candle(high, low, close) {
    return {
        mid: {
            open: close,
            high,
            low,
            close,
        },
    };
}

const atr = createAtr(3);
assert.equal(atr.next(candle(10, 8, 9)), null);
assert.equal(atr.next(candle(11, 9, 10)), null);
approximately(atr.next(candle(13, 10, 12)), 7 / 3);
approximately(atr.next(candle(14, 12, 13)), 20 / 9);

const rsi = createRsi(3);
assert.equal(rsi.next(1), null);
assert.equal(rsi.next(2), null);
assert.equal(rsi.next(3), null);
assert.equal(rsi.next(4), 100);
approximately(rsi.next(3), 200 / 3);

const highest = createRollingHighest(3);
assert.deepEqual(
    [1, 3, 2, 4].map((value) => highest.next(value)),
    [null, null, 3, 4]
);

const lowest = createRollingLowest(3);
assert.deepEqual(
    [3, 1, 2, 0].map((value) => lowest.next(value)),
    [null, null, 1, 0]
);

const stdev = createRollingStandardDeviation(3);
assert.equal(stdev.next(1), null);
assert.equal(stdev.next(2), null);
approximately(stdev.next(3), Math.sqrt(2 / 3));

assert.equal(crossover(1, 3, 2, 2), true);
assert.equal(crossover(null, 3, 2, 2), false);
assert.equal(crossunder(3, 1, 2, 2), true);
assert.equal(crossunder(3, null, 2, 2), false);

assert.equal(pivotHigh([1, 2, 5, 2, 1], 2, 2), 5);
assert.equal(pivotHigh([1, 2, 5, 5, 1], 2, 2), null);
assert.equal(pivotLow([5, 4, 1, 4, 5], 2, 2), 1);
assert.equal(pivotLow([5, 4, 1, 1, 5], 2, 2), null);

console.log("Indicator library test passed.");
