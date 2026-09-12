import assert from "node:assert/strict";

import { createOrbStrategy } from "../strategies/orb/orb-strategy.js";

const MINUTE = 60 * 1000;
const START = Date.parse("2026-09-07T08:00:00Z");

function candle(minute, {
    open,
    high,
    low,
    close,
}) {
    return {
        time: START + minute * MINUTE,
        mid: {
            open,
            high,
            low,
            close,
        },
    };
}

function context(item, index, openTrades = []) {
    return {
        candle: item,
        index,
        instrument: "EUR_USD",
        timeframe: "M1",
        account: null,
        position: null,
        openTrades,
        pendingOrders: [],
    };
}

function createBaseStrategy(overrides = {}) {
    return createOrbStrategy({
        orbStartHour: 8,
        orbStartMinute: 0,
        orbDurationMinutes: 2,
        timezoneMode: "UTC",
        atrLength: 1,
        breakoutCondition: "CLOSE",
        requiredRetests: 1,
        breakoutDistanceEntryEnabled: false,
        stopLossMode: "PIPS",
        stopLossValue: 10,
        takeProfitMode: "PIPS",
        takeProfitValue: 20,
        latestEntryEnabled: false,
        ...overrides,
    });
}

function openingBars() {
    return [
        candle(0, {
            open: 1.1000,
            high: 1.1010,
            low: 1.0990,
            close: 1.1005,
        }),
        candle(1, {
            open: 1.1005,
            high: 1.1020,
            low: 1.1000,
            close: 1.1015,
        }),
    ];
}

function testRequiredRetestEntry() {
    const strategy = createBaseStrategy();
    const bars = [
        ...openingBars(),
        candle(2, {
            open: 1.1015,
            high: 1.1030,
            low: 1.1010,
            close: 1.1025,
        }),
        candle(3, {
            open: 1.1025,
            high: 1.1030,
            low: 1.1015,
            close: 1.1022,
        }),
    ];

    assert.equal(strategy.onCandle(context(bars[0], 0)), null);
    assert.equal(strategy.onCandle(context(bars[1], 1)), null);
    assert.equal(strategy.onCandle(context(bars[2], 2)), null);

    const intents = strategy.onCandle(context(bars[3], 3));

    assert.equal(intents.length, 1);
    assert.equal(intents[0].action, "ENTER");
    assert.equal(intents[0].reason, "ORB_ENTRY");
    assert.equal(intents[0].side, "LONG");
    assert.equal(intents[0].metadata.breakoutQualification, "RETESTS");
    assert.equal(intents[0].metadata.breakoutRetests, 1);
}

function testBreakoutDistanceEntry() {
    const strategy = createBaseStrategy({
        requiredRetests: 3,
        breakoutDistanceEntryEnabled: true,
        breakoutDistanceMode: "PIPS",
        breakoutDistanceValue: 5,
    });
    const bars = [
        ...openingBars(),
        candle(2, {
            open: 1.1015,
            high: 1.1030,
            low: 1.1010,
            close: 1.1025,
        }),
    ];

    strategy.onCandle(context(bars[0], 0));
    strategy.onCandle(context(bars[1], 1));

    const intents = strategy.onCandle(context(bars[2], 2));

    assert.equal(intents.length, 1);
    assert.equal(intents[0].action, "ENTER");
    assert.equal(intents[0].metadata.breakoutQualification, "DISTANCE");
}

function testWickCanCreateBreakoutBeforeClose() {
    const closeStrategy = createBaseStrategy({
        breakoutCondition: "CLOSE",
        requiredRetests: 1,
    });
    const wickStrategy = createBaseStrategy({
        breakoutCondition: "WICK",
        requiredRetests: 1,
    });
    const bars = [
        ...openingBars(),
        candle(2, {
            open: 1.1015,
            high: 1.1030,
            low: 1.1010,
            close: 1.1020,
        }),
        candle(3, {
            open: 1.1020,
            high: 1.1030,
            low: 1.1015,
            close: 1.1023,
        }),
    ];

    for (let index = 0; index < 3; index++) {
        closeStrategy.onCandle(context(bars[index], index));
        wickStrategy.onCandle(context(bars[index], index));
    }

    const closeIntents = closeStrategy.onCandle(context(bars[3], 3));
    const wickIntents = wickStrategy.onCandle(context(bars[3], 3));

    assert.equal(closeIntents, null);
    assert.equal(wickIntents.length, 1);
    assert.equal(wickIntents[0].action, "ENTER");
    assert.equal(wickIntents[0].side, "LONG");
}

function testMaxOrbRangeBlocksTrade() {
    const strategy = createBaseStrategy({
        requiredRetests: 0,
        maxOrbRangeEnabled: true,
        maxOrbRangeMode: "PIPS",
        maxOrbRangeValue: 5,
    });
    const bars = [
        ...openingBars(),
        candle(2, {
            open: 1.1015,
            high: 1.1040,
            low: 1.1010,
            close: 1.1030,
        }),
    ];

    strategy.onCandle(context(bars[0], 0));
    strategy.onCandle(context(bars[1], 1));

    assert.equal(strategy.onCandle(context(bars[2], 2)), null);
}

function testTpProgressionUpdatesBracket() {
    const strategy = createBaseStrategy({
        tpProgressEnabled: true,
        tpProgressTriggerPct: 90,
        tpProgressStopPct: 75,
        tpProgressExtendTarget: true,
        tpProgressTargetPct: 125,
        tpProgressRepeat: false,
    });
    const trade = {
        id: "trade-1",
        side: "LONG",
        entryPrice: 1.1000,
        stopLoss: 1.0950,
        takeProfit: 1.1200,
    };
    const item = candle(10, {
        open: 1.1180,
        high: 1.1200,
        low: 1.1170,
        close: 1.1190,
    });

    const intents = strategy.onCandle(context(item, 10, [trade]));

    assert.equal(intents.length, 2);
    assert.equal(intents[0].action, "UPDATE_STOP");
    assert.ok(Math.abs(intents[0].stopLoss.value - 1.1150) < 1e-10);
    assert.equal(intents[1].action, "UPDATE_TARGET");
    assert.ok(Math.abs(intents[1].takeProfit.value - 1.1250) < 1e-10);
}

testRequiredRetestEntry();
testBreakoutDistanceEntry();
testWickCanCreateBreakoutBeforeClose();
testMaxOrbRangeBlocksTrade();
testTpProgressionUpdatesBracket();

console.log("ORB TradingView-aligned entry tests passed");
