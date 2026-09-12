import assert from "node:assert/strict";

import { createSimpleSmaStrategy } from "../strategies/simple-sma/simple-sma-strategy.js";

function context(close, openTrades = []) {
    return {
        candle: {
            time: 0,
            mid: {
                open: close,
                high: close,
                low: close,
                close,
            },
        },
        openTrades,
    };
}

const strategy = createSimpleSmaStrategy({ smaLength: 3 });

assert.equal(strategy.onCandle(context(1)), null);
assert.equal(strategy.onCandle(context(2)), null);

const entry = strategy.onCandle(context(3));
assert.equal(entry.action, "ENTER");
assert.equal(entry.side, "LONG");
assert.equal(entry.reason, "SMA_CLOSE_ABOVE");
assert.equal(entry.metadata.sma, 2);

const openLong = [{ id: "trade-1", side: "LONG" }];
assert.equal(strategy.onCandle(context(3, openLong)), null);

const exit = strategy.onCandle(context(1, openLong));
assert.equal(exit.action, "EXIT");
assert.deepEqual(exit.target, {
    type: "SIDE",
    value: "LONG",
});
assert.equal(exit.reason, "SMA_CLOSE_BELOW");

strategy.reset();
assert.equal(strategy.onCandle(context(10)), null);
assert.equal(strategy.onCandle(context(10)), null);

console.log("Simple SMA strategy test passed.");
