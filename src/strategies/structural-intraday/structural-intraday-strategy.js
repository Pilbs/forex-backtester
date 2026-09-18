import { createH1Structure } from "./h1-structure.js";
import { createM1Trigger } from "./m1-triggers.js";

const MINUTE_MS = 60 * 1000;

const londonFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

const newYorkFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

function minutesSinceMidnight(formatter, time) {
    const parts = formatter.formatToParts(new Date(time));
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);

    return hour * 60 + minute;
}

export function isLondonNewYorkOverlap(time) {
    const londonMinutes = minutesSinceMidnight(londonFormatter, time);
    const newYorkMinutes = minutesSinceMidnight(newYorkFormatter, time);

    return (
        londonMinutes >= 12 * 60
        && londonMinutes < 17 * 60
        && newYorkMinutes >= 8 * 60
        && newYorkMinutes < 13 * 60
    );
}

function protectiveLevels({
    stopLossEnabled,
    stopLossPips,
    takeProfitEnabled,
    takeProfitPips,
}) {
    const levels = {};

    if (stopLossEnabled) {
        levels.stopLoss = {
            type: "PIPS",
            value: stopLossPips,
        };
    }

    if (takeProfitEnabled) {
        levels.takeProfit = {
            type: "PIPS",
            value: takeProfitPips,
        };
    }

    return levels;
}

export function createStructuralIntradayStrategy({
    longEnabled = true,
    shortEnabled = true,

    h1AtrLength = 14,

    longH1RangeLookbackHours = 12,
    longRangePositionMin = 0.080119,
    longRangePositionMax = 0.161440,

    shortH1ReturnLookbackHours = 6,
    shortReturnAtrMin = -0.083102,
    shortReturnAtrMax = 0.484133,

    longTriggerType = "MOMENTUM_BURST_5M",
    shortTriggerType = "MOMENTUM_BURST_5M",

    momentumReturnLookback = 5,
    momentumAtrLength = 14,
    momentumAtrMultiple = 1.25,
    momentumFastEma = 30,
    momentumSlowEma = 60,

    cooldownMinutes = 15,
    maxHoldMinutes = 60,

    stopLossEnabled = false,
    stopLossPips = 10,
    takeProfitEnabled = false,
    takeProfitPips = 15,
} = {}) {
    const h1Structure = createH1Structure({
        atrLength: h1AtrLength,
        longRangeLookbackHours: longH1RangeLookbackHours,
        shortReturnLookbackHours: shortH1ReturnLookbackHours,
    });

    const momentum = {
        returnLookback: momentumReturnLookback,
        atrLength: momentumAtrLength,
        atrMultiple: momentumAtrMultiple,
        fastEma: momentumFastEma,
        slowEma: momentumSlowEma,
    };

    const longTrigger = createM1Trigger({
        type: longTriggerType,
        direction: "LONG",
        momentum,
    });

    const shortTrigger = createM1Trigger({
        type: shortTriggerType,
        direction: "SHORT",
        momentum,
    });

    let lastEntrySignalTime = null;

    function reset() {
        h1Structure.reset();
        longTrigger.reset();
        shortTrigger.reset();
        lastEntrySignalTime = null;
    }

    function onCandle(context) {
        if (context.timeframe !== "M1") {
            throw new Error(
                "Structural Intraday requires M1 as the strategy timeframe"
            );
        }

        const { candle, openTrades } = context;
        const structure = h1Structure.next(candle);

        // Triggers always advance so their state remains causal even when the
        // structural regime or session currently blocks entries.
        const longTriggerResult = longTrigger.next(candle);
        const shortTriggerResult = shortTrigger.next(candle);

        const activeTrade = openTrades[0] ?? null;

        if (activeTrade) {
            if (
                Number.isFinite(activeTrade.entryTime)
                && candle.time - activeTrade.entryTime >= maxHoldMinutes * MINUTE_MS
            ) {
                return {
                    action: "EXIT",
                    target: {
                        type: "TRADE_ID",
                        value: activeTrade.id,
                    },
                    reason: "STRUCTURAL_MAX_HOLD",
                    metadata: {
                        strategy: "STRUCTURAL_INTRADAY",
                        maxHoldMinutes,
                    },
                };
            }

            return null;
        }

        if (openTrades.length > 0 || !isLondonNewYorkOverlap(candle.time)) {
            return null;
        }

        if (
            lastEntrySignalTime !== null
            && candle.time - lastEntrySignalTime < cooldownMinutes * MINUTE_MS
        ) {
            return null;
        }

        const longRegimeMatched = (
            longEnabled
            && Number.isFinite(structure.longRangePosition)
            && structure.longRangePosition >= longRangePositionMin
            && structure.longRangePosition <= longRangePositionMax
        );

        const shortRegimeMatched = (
            shortEnabled
            && Number.isFinite(structure.shortReturnAtr)
            && structure.shortReturnAtr >= shortReturnAtrMin
            && structure.shortReturnAtr <= shortReturnAtrMax
        );

        const longEntry = longRegimeMatched && longTriggerResult.matched;
        const shortEntry = shortRegimeMatched && shortTriggerResult.matched;

        // If both sides happen to trigger on the same M1 close, skip the bar
        // rather than introducing an arbitrary priority rule.
        if (longEntry === shortEntry) {
            return null;
        }

        const side = longEntry ? "LONG" : "SHORT";
        const triggerResult = longEntry
            ? longTriggerResult
            : shortTriggerResult;

        lastEntrySignalTime = candle.time;

        return {
            action: "ENTER",
            side,
            reason: "STRUCTURAL_M1_TRIGGER",
            ...protectiveLevels({
                stopLossEnabled,
                stopLossPips,
                takeProfitEnabled,
                takeProfitPips,
            }),
            metadata: {
                strategy: "STRUCTURAL_INTRADAY",
                side,
                h1Atr: structure.atr,
                h1LongRangePosition: structure.longRangePosition,
                h1ShortReturnAtr: structure.shortReturnAtr,
                longRegimeMatched,
                shortRegimeMatched,
                trigger: triggerResult.metadata,
            },
        };
    }

    return {
        name: "Structural Intraday",
        reset,
        onCandle,
    };
}
