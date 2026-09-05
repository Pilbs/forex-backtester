import { createAtr } from "../../indicators/index.js";
import { createAtrBreakoutDetector } from "./atr-breakout-detector.js";
import { createBreakoutDetector } from "./breakout-detector.js";
import { createDailyOpeningRange } from "./daily-opening-range.js";

const ENTRY_MODES = new Set(["FIRST_BREAKOUT", "ATR_WEIGHTED"]);

export function createOrbStrategy({
    startHour = 8,
    startMinute = 15,
    durationMinutes = 60,
    timeZone = "America/New_York",
    stopLossPips,
    takeProfitPips,
    entryMode = "FIRST_BREAKOUT",
    breakoutSource = "CLOSE",
    retestSource = "WICK",
    atrLength = 14,
    candidateBreakoutAtr = 0.5,
    strongBreakoutAtr = 1,
}) {
    if (!ENTRY_MODES.has(entryMode)) {
        throw new Error("entryMode must be FIRST_BREAKOUT or ATR_WEIGHTED");
    }

    const dailyRange = createDailyOpeningRange({
        startHour,
        startMinute,
        durationMinutes,
        timeZone,
    });
    const firstBreakoutDetector = createBreakoutDetector();
    const atr = entryMode === "ATR_WEIGHTED" ? createAtr(atrLength) : null;
    const atrBreakoutDetector = entryMode === "ATR_WEIGHTED"
        ? createAtrBreakoutDetector({
            breakoutSource,
            retestSource,
            candidateBreakoutAtr,
            strongBreakoutAtr,
        })
        : null;

    function reset() {
        dailyRange.reset();
        firstBreakoutDetector.reset();
        atr?.reset();
        atrBreakoutDetector?.reset();
    }

    function onCandle({ candle }) {
        const atrValue = atr?.next(candle) ?? null;

        dailyRange.onCandle(candle);

        const rangeState = dailyRange.getState();

        if (!rangeState.complete) {
            return null;
        }

        const breakout = entryMode === "ATR_WEIGHTED"
            ? atrBreakoutDetector.onCandle({
                candle,
                rangeState,
                atr: atrValue,
            })
            : firstBreakoutDetector.onCandle({
                candle,
                rangeState,
            });

        if (!breakout || breakout.direction === "BOTH") {
            return null;
        }

        return {
            action: "ENTER",
            side: breakout.direction === "ABOVE" ? "LONG" : "SHORT",
            stopLoss: {
                type: "PIPS",
                value: stopLossPips,
            },
            takeProfit: {
                type: "PIPS",
                value: takeProfitPips,
            },
            metadata: {
                strategy: "ORB",
                entryMode,
                breakoutDirection: breakout.direction,
                breakoutQualification: breakout.qualification ?? "FIRST_BREAKOUT",
                breakoutSource: entryMode === "ATR_WEIGHTED" ? breakoutSource : null,
                retestSource: entryMode === "ATR_WEIGHTED" ? retestSource : null,
                atr: breakout.atr ?? null,
                breakoutStrengthAtr: breakout.breakoutStrengthAtr ?? null,
                candidateStrengthAtr: breakout.candidateStrengthAtr ?? null,
                candidateTime: breakout.candidateTime ?? null,
                retestTime: breakout.retestTime ?? null,
                rangeHigh: breakout.rangeHigh,
                rangeLow: breakout.rangeLow,
            },
        };
    }

    return {
        name: "ORB",
        reset,
        onCandle,
    };
}
