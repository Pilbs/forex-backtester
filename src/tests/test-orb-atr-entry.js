import assert from "node:assert/strict";
import { createAtrBreakoutDetector } from "../strategies/orb/atr-breakout-detector.js";

const rangeState = {
    complete: true,
    date: "2026-09-01",
    high: 100,
    low: 90,
};

function candle({
    time,
    open = 100,
    high,
    low,
    close,
}) {
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

function testStrongCloseBreakoutEntersImmediately() {
    const detector = createAtrBreakoutDetector({
        breakoutSource: "CLOSE",
        retestSource: "WICK",
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    });

    const signal = detector.onCandle({
        candle: candle({ time: 1, high: 111, low: 101, close: 110 }),
        rangeState,
        atr: 10,
    });

    assert.equal(signal.direction, "ABOVE");
    assert.equal(signal.qualification, "STRONG_BREAKOUT");
    assert.equal(signal.breakoutStrengthAtr, 1);
}

function testCandidateThenWickRetestAndCloseContinuation() {
    const detector = createAtrBreakoutDetector({
        breakoutSource: "CLOSE",
        retestSource: "WICK",
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    });

    const candidateSignal = detector.onCandle({
        candle: candle({ time: 1, high: 107, low: 102, close: 106 }),
        rangeState,
        atr: 10,
    });

    assert.equal(candidateSignal, null);
    assert.equal(detector.getState().candidate.direction, "ABOVE");
    assert.equal(detector.getState().candidate.strengthAtr, 0.6);

    const entrySignal = detector.onCandle({
        candle: candle({ time: 2, high: 106, low: 99, close: 104 }),
        rangeState,
        atr: 10,
    });

    assert.equal(entrySignal.direction, "ABOVE");
    assert.equal(entrySignal.qualification, "RETEST_CONTINUATION");
    assert.equal(entrySignal.candidateTime, 1);
    assert.equal(entrySignal.retestTime, 2);
}

function testCandidateCanQualifyByReachingStrongThresholdWithoutRetest() {
    const detector = createAtrBreakoutDetector({
        breakoutSource: "CLOSE",
        retestSource: "WICK",
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    });

    detector.onCandle({
        candle: candle({ time: 1, high: 107, low: 102, close: 106 }),
        rangeState,
        atr: 10,
    });

    const signal = detector.onCandle({
        candle: candle({ time: 2, high: 112, low: 103, close: 111 }),
        rangeState,
        atr: 12,
    });

    assert.equal(signal.direction, "ABOVE");
    assert.equal(signal.qualification, "STRONG_BREAKOUT_AFTER_CANDIDATE");
    assert.equal(signal.atr, 10);
    assert.equal(signal.breakoutStrengthAtr, 1.1);
}

function testBreakoutSourceCanBeCloseOrWick() {
    const closeDetector = createAtrBreakoutDetector({
        breakoutSource: "CLOSE",
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    });
    const wickDetector = createAtrBreakoutDetector({
        breakoutSource: "WICK",
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    });
    const breakoutCandle = candle({ time: 1, high: 108, low: 99, close: 103 });

    closeDetector.onCandle({ candle: breakoutCandle, rangeState, atr: 10 });
    wickDetector.onCandle({ candle: breakoutCandle, rangeState, atr: 10 });

    assert.equal(closeDetector.getState().candidate, null);
    assert.equal(wickDetector.getState().candidate.direction, "ABOVE");
    assert.equal(wickDetector.getState().candidate.strengthAtr, 0.8);
}

function testCloseRetestRequiresCloseToReturnToRange() {
    const detector = createAtrBreakoutDetector({
        breakoutSource: "CLOSE",
        retestSource: "CLOSE",
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    });

    detector.onCandle({
        candle: candle({ time: 1, high: 107, low: 102, close: 106 }),
        rangeState,
        atr: 10,
    });

    detector.onCandle({
        candle: candle({ time: 2, high: 105, low: 99, close: 102 }),
        rangeState,
        atr: 10,
    });

    assert.equal(detector.getState().candidate.retested, false);

    detector.onCandle({
        candle: candle({ time: 3, high: 102, low: 98, close: 99 }),
        rangeState,
        atr: 10,
    });

    assert.equal(detector.getState().candidate.retested, true);

    const signal = detector.onCandle({
        candle: candle({ time: 4, high: 103, low: 99, close: 101 }),
        rangeState,
        atr: 10,
    });

    assert.equal(signal.direction, "ABOVE");
    assert.equal(signal.qualification, "RETEST_CONTINUATION");
}

function testCandidateIsNotInvalidatedByReturningThroughRange() {
    const detector = createAtrBreakoutDetector({
        breakoutSource: "CLOSE",
        retestSource: "CLOSE",
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    });

    detector.onCandle({
        candle: candle({ time: 1, high: 107, low: 102, close: 106 }),
        rangeState,
        atr: 10,
    });

    const oppositeMoveSignal = detector.onCandle({
        candle: candle({ time: 2, high: 100, low: 88, close: 89 }),
        rangeState,
        atr: 10,
    });

    assert.equal(oppositeMoveSignal, null);
    assert.equal(detector.getState().candidate.direction, "ABOVE");
    assert.equal(detector.getState().candidate.retested, true);

    const continuationSignal = detector.onCandle({
        candle: candle({ time: 3, high: 102, low: 99, close: 101 }),
        rangeState,
        atr: 10,
    });

    assert.equal(continuationSignal.direction, "ABOVE");
    assert.equal(continuationSignal.qualification, "RETEST_CONTINUATION");
}

function testWickRetestRequiresLaterWickContinuation() {
    const detector = createAtrBreakoutDetector({
        breakoutSource: "WICK",
        retestSource: "WICK",
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    });

    detector.onCandle({
        candle: candle({ time: 1, high: 106, low: 101, close: 104 }),
        rangeState,
        atr: 10,
    });

    const sameCandleSignal = detector.onCandle({
        candle: candle({ time: 2, high: 105, low: 99, close: 102 }),
        rangeState,
        atr: 10,
    });

    assert.equal(sameCandleSignal, null);
    assert.equal(detector.getState().candidate.retested, true);

    const laterSignal = detector.onCandle({
        candle: candle({ time: 3, high: 103, low: 100, close: 101 }),
        rangeState,
        atr: 10,
    });

    assert.equal(laterSignal.direction, "ABOVE");
    assert.equal(laterSignal.qualification, "RETEST_CONTINUATION");
}

testStrongCloseBreakoutEntersImmediately();
testCandidateThenWickRetestAndCloseContinuation();
testCandidateCanQualifyByReachingStrongThresholdWithoutRetest();
testBreakoutSourceCanBeCloseOrWick();
testCloseRetestRequiresCloseToReturnToRange();
testCandidateIsNotInvalidatedByReturningThroughRange();
testWickRetestRequiresLaterWickContinuation();

console.log("ORB ATR entry tests passed");
