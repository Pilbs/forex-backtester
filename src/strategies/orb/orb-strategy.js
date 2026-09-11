import { createAtr } from "../../indicators/index.js";
import { getInstrumentMetadata } from "../../market/instrument-metadata.js";
import { getZonedMinutesSinceMidnight } from "../../time/zoned-time.js";
import { createDailyOpeningRange } from "./daily-opening-range.js";

const TIMEZONE_MAP = Object.freeze({
    EXCHANGE: "Etc/UTC",
    NEW_YORK: "America/New_York",
    LONDON: "Europe/London",
    UTC: "Etc/UTC",
});

function resolveTimeZone(timezoneMode, legacyTimeZone = null) {
    if (legacyTimeZone) {
        return legacyTimeZone;
    }

    const timeZone = TIMEZONE_MAP[timezoneMode];

    if (!timeZone) {
        throw new Error("timezoneMode must be EXCHANGE, NEW_YORK, LONDON or UTC");
    }

    return timeZone;
}

function isFriday(time, timeZone) {
    const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
    }).format(new Date(time));

    return weekday === "Fri";
}

function isMinuteInWindow(currentMinutes, startMinutes, endMinutes) {
    return startMinutes <= endMinutes
        ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
        : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function breakoutPrices(candle, breakoutCondition) {
    if (breakoutCondition === "CLOSE") {
        return {
            above: candle.mid.close,
            below: candle.mid.close,
        };
    }

    if (breakoutCondition === "WICK") {
        return {
            above: candle.mid.high,
            below: candle.mid.low,
        };
    }

    throw new Error("breakoutCondition must be CLOSE or WICK");
}

function distanceFromMode({
    mode,
    value,
    atrValue,
    pipSize,
    rangeSize = null,
}) {
    if (mode === "ATR") {
        return Number.isFinite(atrValue) ? atrValue * value : null;
    }

    if (mode === "PIPS") {
        return pipSize * value;
    }

    if (mode === "UNITS") {
        return value;
    }

    if (mode === "RANGE_PERCENT") {
        return Number.isFinite(rangeSize) ? rangeSize * value / 100 : null;
    }

    throw new Error(`Unsupported distance mode: ${mode}`);
}

function protectiveLevel({
    mode,
    value,
    atrValue,
    pipSize,
}) {
    if (mode === "PERCENT") {
        return {
            type: "PERCENT",
            value,
        };
    }

    const priceDistance = distanceFromMode({
        mode,
        value,
        atrValue,
        pipSize,
    });

    if (!Number.isFinite(priceDistance) || priceDistance <= 0) {
        return null;
    }

    return {
        type: "PIPS",
        value: priceDistance / pipSize,
    };
}

export function createOrbStrategy({
    orbStartHour = 8,
    orbStartMinute = 15,
    orbDurationMinutes = 60,
    timezoneMode = "EXCHANGE",
    breakoutCondition = "CLOSE",
    requiredRetests = 1,
    breakoutDistanceEntryEnabled = false,
    breakoutDistanceMode = "ATR",
    breakoutDistanceValue = 1,
    maxOrbRangeEnabled = false,
    maxOrbRangeMode = "PIPS",
    maxOrbRangeValue = 30,
    atrLength = 12,
    stopLossMode = "PERCENT",
    stopLossValue = 0.20,
    takeProfitMode = "ATR",
    takeProfitValue = 3,
    tpProgressEnabled = false,
    tpProgressTriggerPct = 90,
    tpProgressStopPct = 75,
    tpProgressExtendTarget = true,
    tpProgressTargetPct = 125,
    tpProgressRepeat = true,
    tpProgressStepPct = 25,
    closeAtNextORB = true,
    latestEntryEnabled = true,
    latestEntryHour = 12,
    latestEntryMinute = 15,
    skipFridayEntries = false,
    profitExitWindowEnabled = false,
    profitExitStartHour = 17,
    profitExitStartMinute = 0,
    profitExitEndHour = 18,
    profitExitEndMinute = 0,

    // Backward-compatible direct-factory override. Not exposed by orbDefinition.
    timeZone = null,
} = {}) {
    const strategyTimeZone = resolveTimeZone(timezoneMode, timeZone);
    const atr = createAtr(atrLength);
    const dailyRange = createDailyOpeningRange({
        startHour: orbStartHour,
        startMinute: orbStartMinute,
        durationMinutes: orbDurationMinutes,
        timeZone: strategyTimeZone,
    });

    let currentOrbDate = null;
    let orbState = "WAITING_FOR_ORB";
    let orbTradingDayAllowed = true;
    let orbRangeAllowed = true;
    let breakoutBullish = false;
    let breakoutStartIndex = null;
    let breakoutRetests = 0;
    let breakoutEntryDistance = null;

    let managedTradeId = null;
    let initialTargetDistance = null;
    let tpProgressStage = 0;

    function resetBreakoutState() {
        orbState = "OPENING_RANGE";
        orbRangeAllowed = true;
        breakoutBullish = false;
        breakoutStartIndex = null;
        breakoutRetests = 0;
        breakoutEntryDistance = null;
    }

    function resetTradeManagement() {
        managedTradeId = null;
        initialTargetDistance = null;
        tpProgressStage = 0;
    }

    function reset() {
        atr.reset();
        dailyRange.reset();
        currentOrbDate = null;
        orbTradingDayAllowed = true;
        resetBreakoutState();
        orbState = "WAITING_FOR_ORB";
        resetTradeManagement();
    }

    function syncTradeManagement(openTrades) {
        const trade = openTrades[0] ?? null;

        if (!trade) {
            resetTradeManagement();
            return null;
        }

        if (managedTradeId !== trade.id) {
            managedTradeId = trade.id;
            tpProgressStage = 0;
            initialTargetDistance = Number.isFinite(trade.takeProfit)
                ? Math.abs(trade.takeProfit - trade.entryPrice)
                : null;
        }

        return trade;
    }

    function buildTpProgressIntents(trade, candle) {
        if (
            !tpProgressEnabled ||
            !Number.isFinite(initialTargetDistance) ||
            initialTargetDistance <= 0
        ) {
            return [];
        }

        const isLong = trade.side === "LONG";
        const close = candle.mid.close;
        let nextStop = trade.stopLoss;
        let nextTarget = trade.takeProfit;
        let bracketUpdated = false;
        let keepChecking = true;
        let stagesProcessed = 0;

        while (keepChecking && stagesProcessed < 20) {
            const stageOffset = tpProgressRepeat
                ? tpProgressStage * tpProgressStepPct
                : 0;
            const triggerPct = tpProgressTriggerPct + stageOffset;
            const triggerPrice = isLong
                ? trade.entryPrice + initialTargetDistance * triggerPct / 100
                : trade.entryPrice - initialTargetDistance * triggerPct / 100;
            const triggerReached = isLong
                ? close >= triggerPrice
                : close <= triggerPrice;

            if (!triggerReached || (!tpProgressRepeat && tpProgressStage > 0)) {
                keepChecking = false;
                continue;
            }

            const stopPct = tpProgressStopPct + stageOffset;
            const proposedStop = isLong
                ? trade.entryPrice + initialTargetDistance * stopPct / 100
                : trade.entryPrice - initialTargetDistance * stopPct / 100;

            if (nextStop === null || nextStop === undefined) {
                nextStop = proposedStop;
            } else {
                nextStop = isLong
                    ? Math.max(nextStop, proposedStop)
                    : Math.min(nextStop, proposedStop);
            }

            if (tpProgressExtendTarget) {
                const targetPct = tpProgressTargetPct + stageOffset;
                const proposedTarget = isLong
                    ? trade.entryPrice + initialTargetDistance * targetPct / 100
                    : trade.entryPrice - initialTargetDistance * targetPct / 100;

                if (nextTarget === null || nextTarget === undefined) {
                    nextTarget = proposedTarget;
                } else {
                    nextTarget = isLong
                        ? Math.max(nextTarget, proposedTarget)
                        : Math.min(nextTarget, proposedTarget);
                }
            }

            tpProgressStage++;
            stagesProcessed++;
            bracketUpdated = true;

            if (!tpProgressRepeat) {
                keepChecking = false;
            }
        }

        if (!bracketUpdated) {
            return [];
        }

        const intents = [{
            action: "UPDATE_STOP",
            target: {
                type: "TRADE_ID",
                value: trade.id,
            },
            stopLoss: {
                type: "PRICE",
                value: nextStop,
            },
            metadata: {
                strategy: "ORB",
                reason: "TP_PROGRESS",
                stage: tpProgressStage,
            },
        }];

        if (tpProgressExtendTarget && Number.isFinite(nextTarget)) {
            intents.push({
                action: "UPDATE_TARGET",
                target: {
                    type: "TRADE_ID",
                    value: trade.id,
                },
                takeProfit: {
                    type: "PRICE",
                    value: nextTarget,
                },
                metadata: {
                    strategy: "ORB",
                    reason: "TP_PROGRESS",
                    stage: tpProgressStage,
                },
            });
        }

        return intents;
    }

    function onCandle(context) {
        const { candle, index, instrument, openTrades } = context;
        const { pipSize } = getInstrumentMetadata(instrument);
        const atrValue = atr.next(candle);
        const intents = [];

        dailyRange.onCandle(candle);
        const rangeState = dailyRange.getState();
        const activeTrade = syncTradeManagement(openTrades);

        const newOrbStarted = rangeState.candleCount > 0 && rangeState.date !== currentOrbDate;
        let closeRequestedThisBar = false;

        if (newOrbStarted) {
            currentOrbDate = rangeState.date;
            resetBreakoutState();
            orbTradingDayAllowed = !skipFridayEntries || !isFriday(candle.time, strategyTimeZone);

            if (closeAtNextORB && activeTrade) {
                intents.push({
                    action: "EXIT",
                    target: {
                        type: "ALL",
                    },
                    reason: "NEXT_ORB",
                    metadata: {
                        strategy: "ORB",
                    },
                });
                closeRequestedThisBar = true;
            }
        }

        if (rangeState.complete && orbState === "OPENING_RANGE") {
            const completedRange = rangeState.high - rangeState.low;
            const maxRangeDistance = maxOrbRangeEnabled
                ? distanceFromMode({
                    mode: maxOrbRangeMode,
                    value: maxOrbRangeValue,
                    atrValue,
                    pipSize,
                    rangeSize: completedRange,
                })
                : null;

            orbRangeAllowed = !maxOrbRangeEnabled || (
                Number.isFinite(maxRangeDistance) && completedRange <= maxRangeDistance
            );
            orbState = orbTradingDayAllowed && orbRangeAllowed
                ? "WAITING_FOR_BREAKOUT"
                : "NO_TRADE";
        }

        let currentMinutes = null;
        const latestEntryMinutes = latestEntryHour * 60 + latestEntryMinute;
        const getCurrentMinutes = () => {
            if (currentMinutes === null) {
                currentMinutes = getZonedMinutesSinceMidnight(candle.time, strategyTimeZone);
            }

            return currentMinutes;
        };
        const entryTimeAllowed = () =>
            !latestEntryEnabled || getCurrentMinutes() < latestEntryMinutes;
        let entrySignal = false;

        if (rangeState.complete && orbState === "WAITING_FOR_BREAKOUT" && entryTimeAllowed()) {
            const prices = breakoutPrices(candle, breakoutCondition);
            const brokeAbove = prices.above > rangeState.high;
            const brokeBelow = prices.below < rangeState.low;

            if (brokeAbove !== brokeBelow) {
                breakoutBullish = brokeAbove;
                breakoutStartIndex = index;
                breakoutRetests = 0;
                breakoutEntryDistance = distanceFromMode({
                    mode: breakoutDistanceMode,
                    value: breakoutDistanceValue,
                    atrValue,
                    pipSize,
                    rangeSize: rangeState.high - rangeState.low,
                });
                orbState = "IN_BREAKOUT";
            }
        }

        if (rangeState.complete && orbState === "IN_BREAKOUT") {
            if (!entryTimeAllowed()) {
                orbState = "ENTRY_CUTOFF";
            } else {
                const prices = breakoutPrices(candle, breakoutCondition);
                const sourcePrice = breakoutBullish ? prices.above : prices.below;
                const breakoutDistanceReached = breakoutDistanceEntryEnabled &&
                    Number.isFinite(breakoutEntryDistance) && (
                        breakoutBullish
                            ? sourcePrice >= rangeState.high + breakoutEntryDistance
                            : sourcePrice <= rangeState.low - breakoutEntryDistance
                    );
                const failedBreakout = breakoutBullish
                    ? candle.mid.close < rangeState.high
                    : candle.mid.close > rangeState.low;

                if (failedBreakout) {
                    breakoutStartIndex = null;
                    breakoutRetests = 0;
                    breakoutEntryDistance = null;
                    orbState = "WAITING_FOR_BREAKOUT";
                } else {
                    const retested = index > breakoutStartIndex && (
                        breakoutBullish
                            ? candle.mid.close > rangeState.high && candle.mid.low < rangeState.high
                            : candle.mid.close < rangeState.low && candle.mid.high > rangeState.low
                    );

                    if (retested) {
                        breakoutRetests++;
                    }

                    if (breakoutDistanceReached || breakoutRetests >= requiredRetests) {
                        entrySignal = true;
                        orbState = "ENTRY_TAKEN";
                    }
                }
            }
        }

        if (activeTrade && !closeRequestedThisBar && profitExitWindowEnabled) {
            const profitExitStartMinutes = profitExitStartHour * 60 + profitExitStartMinute;
            const profitExitEndMinutes = profitExitEndHour * 60 + profitExitEndMinute;
            const inProfitExitWindow = isMinuteInWindow(
                getCurrentMinutes(),
                profitExitStartMinutes,
                profitExitEndMinutes
            );
            const tradeInProfit = activeTrade.side === "LONG"
                ? candle.mid.close > activeTrade.entryPrice
                : candle.mid.close < activeTrade.entryPrice;

            if (inProfitExitWindow && tradeInProfit) {
                intents.push({
                    action: "EXIT",
                    target: {
                        type: "ALL",
                    },
                    reason: "PROFIT_WINDOW",
                    metadata: {
                        strategy: "ORB",
                    },
                });
                closeRequestedThisBar = true;
            }
        }

        if (activeTrade && !closeRequestedThisBar) {
            intents.push(...buildTpProgressIntents(activeTrade, candle));
        }

        if (entrySignal && openTrades.length === 0 && !closeRequestedThisBar) {
            const stopLoss = protectiveLevel({
                mode: stopLossMode,
                value: stopLossValue,
                atrValue,
                pipSize,
            });
            const takeProfit = protectiveLevel({
                mode: takeProfitMode,
                value: takeProfitValue,
                atrValue,
                pipSize,
            });

            if (stopLoss && takeProfit) {
                intents.push({
                    action: "ENTER",
                    side: breakoutBullish ? "LONG" : "SHORT",
                    stopLoss,
                    takeProfit,
                    metadata: {
                        strategy: "ORB",
                        breakoutCondition,
                        requiredRetests,
                        breakoutRetests,
                        breakoutDistanceEntryEnabled,
                        breakoutDistanceMode,
                        breakoutDistanceValue,
                        breakoutQualification: breakoutRetests >= requiredRetests
                            ? (requiredRetests === 0 ? "IMMEDIATE" : "RETESTS")
                            : "DISTANCE",
                        atr: atrValue,
                        rangeHigh: rangeState.high,
                        rangeLow: rangeState.low,
                    },
                });
            }
        }

        return intents.length > 0 ? intents : null;
    }

    return {
        name: "ORB",
        reset,
        onCandle,
    };
}
