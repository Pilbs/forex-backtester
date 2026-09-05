import assert from "node:assert/strict";

import {
    enrichTradeAnalytics,
    enrichTradesAnalytics,
} from "../backtest/trade-analytics.js";

const longTrade = enrichTradeAnalytics({
    side: "LONG",
    entryTime: Date.parse("2026-01-01T10:00:00Z"),
    exitTime: Date.parse("2026-01-01T10:45:00Z"),
    entryPrice: 1.1000,
    highestPrice: 1.1025,
    lowestPrice: 1.0990,
    pnlPips: -5,
    result: "LOSS",
}, 0.0001);

assert.equal(longTrade.holdingMinutes, 45);
assert.equal(longTrade.mfePips, 25);
assert.equal(longTrade.maePips, 10);
assert.equal(longTrade.wasEverProfitable, true);
assert.equal(
    longTrade.excursionPriceBasis,
    "MID_OHLC_PLUS_EXECUTION_EXITS"
);
assert.equal(
    longTrade.excursionMethod,
    "CAUSAL_CONSERVATIVE"
);

const shortTrade = enrichTradeAnalytics({
    side: "SHORT",
    entryTime: Date.parse("2026-01-01T10:00:00Z"),
    exitTime: Date.parse("2026-01-01T10:30:00Z"),
    entryPrice: 1.1000,
    highestPrice: 1.1015,
    lowestPrice: 1.0980,
    pnlPips: 10,
    result: "WIN",
}, 0.0001);

assert.equal(shortTrade.holdingMinutes, 30);
assert.equal(shortTrade.mfePips, 20);
assert.equal(shortTrade.maePips, 15);

const knownExitTrade = enrichTradeAnalytics({
    side: "LONG",
    entryTime: 0,
    exitTime: 60000,
    entryPrice: 1.1000,
    highestPrice: 1.1000,
    lowestPrice: 1.1000,
    pnlPips: 10,
    exitFills: [{
        pnlPips: 10,
    }],
}, 0.0001);

assert.equal(knownExitTrade.mfePips, 10);
assert.equal(knownExitTrade.maePips, 0);

const trades = enrichTradesAnalytics([
    {
        side: "LONG",
        entryTime: 0,
        exitTime: 60000,
        entryPrice: 1.1000,
        highestPrice: 1.1005,
        lowestPrice: 1.0995,
    },
], 0.0001);

assert.equal(trades.length, 1);
assert.equal(trades[0].holdingMinutes, 1);

console.log("Trade analytics test passed.");
