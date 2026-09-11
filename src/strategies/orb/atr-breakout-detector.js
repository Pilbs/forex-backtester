const SOURCES = new Set(["CLOSE", "WICK"]);

function validateSource(value, name) {
    if (!SOURCES.has(value)) {
        throw new Error(`${name} must be CLOSE or WICK`);
    }
}

function validateThreshold(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive number`);
    }
}

function getBreakoutDistances({
    candle,
    rangeState,
    breakoutSource,
}) {
    const abovePrice = breakoutSource === "CLOSE"
        ? candle.mid.close
        : candle.mid.high;
    const belowPrice = breakoutSource === "CLOSE"
        ? candle.mid.close
        : candle.mid.low;

    return {
        above: Math.max(0, abovePrice - rangeState.high),
        below: Math.max(0, rangeState.low - belowPrice),
    };
}

function isRetest({
    candle,
    rangeState,
    direction,
    retestSource,
}) {
    if (direction === "ABOVE") {
        return retestSource === "CLOSE"
            ? candle.mid.close <= rangeState.high
            : candle.mid.low <= rangeState.high;
    }

    return retestSource === "CLOSE"
        ? candle.mid.close >= rangeState.low
        : candle.mid.high >= rangeState.low;
}

function isOutsideRange({
    candle,
    rangeState,
    direction,
    breakoutSource,
}) {
    if (direction === "ABOVE") {
        return breakoutSource === "CLOSE"
            ? candle.mid.close > rangeState.high
            : candle.mid.high > rangeState.high;
    }

    return breakoutSource === "CLOSE"
        ? candle.mid.close < rangeState.low
        : candle.mid.low < rangeState.low;
}

export function createAtrBreakoutDetector({
    breakoutSource = "CLOSE",
    retestSource = "WICK",
    candidateBreakoutAtr = 0.5,
    strongBreakoutAtr = 1,
} = {}) {
    validateSource(breakoutSource, "breakoutSource");
    validateSource(retestSource, "retestSource");
    validateThreshold(candidateBreakoutAtr, "candidateBreakoutAtr");
    validateThreshold(strongBreakoutAtr, "strongBreakoutAtr");

    if (candidateBreakoutAtr >= strongBreakoutAtr) {
        throw new Error("candidateBreakoutAtr must be lower than strongBreakoutAtr");
    }

    let currentDate = null;
    let candidate = null;
    let completed = false;

    function resetStateForDate(date) {
        currentDate = date;
        candidate = null;
        completed = false;
    }

    function reset() {
        currentDate = null;
        candidate = null;
        completed = false;
    }

    function createSignal({
        candle,
        rangeState,
        direction,
        qualification,
        referenceAtr,
        breakoutStrengthAtr,
    }) {
        completed = true;

        return {
            date: rangeState.date,
            time: candle.time,
            direction,
            qualification,
            rangeHigh: rangeState.high,
            rangeLow: rangeState.low,
            atr: referenceAtr,
            breakoutStrengthAtr,
            candidateTime: candidate?.time ?? null,
            candidateStrengthAtr: candidate?.strengthAtr ?? null,
            retestTime: candidate?.retestTime ?? null,
        };
    }

    function onCandle({
        candle,
        rangeState,
        atr,
    }) {
        if (!rangeState.complete || !Number.isFinite(atr) || atr <= 0) {
            return null;
        }

        if (currentDate !== rangeState.date) {
            resetStateForDate(rangeState.date);
        }

        if (completed) {
            return null;
        }

        if (candidate === null) {
            const distances = getBreakoutDistances({
                candle,
                rangeState,
                breakoutSource,
            });
            const aboveStrength = distances.above / atr;
            const belowStrength = distances.below / atr;
            const strongAbove = aboveStrength >= strongBreakoutAtr;
            const strongBelow = belowStrength >= strongBreakoutAtr;

            if (strongAbove && strongBelow) {
                return createSignal({
                    candle,
                    rangeState,
                    direction: "BOTH",
                    qualification: "AMBIGUOUS_STRONG_BREAKOUT",
                    referenceAtr: atr,
                    breakoutStrengthAtr: Math.max(aboveStrength, belowStrength),
                });
            }

            if (strongAbove || strongBelow) {
                const direction = strongAbove ? "ABOVE" : "BELOW";

                return createSignal({
                    candle,
                    rangeState,
                    direction,
                    qualification: "STRONG_BREAKOUT",
                    referenceAtr: atr,
                    breakoutStrengthAtr: strongAbove ? aboveStrength : belowStrength,
                });
            }

            const candidateAbove = aboveStrength >= candidateBreakoutAtr;
            const candidateBelow = belowStrength >= candidateBreakoutAtr;

            if (candidateAbove && candidateBelow) {
                return null;
            }

            if (!candidateAbove && !candidateBelow) {
                return null;
            }

            candidate = {
                direction: candidateAbove ? "ABOVE" : "BELOW",
                time: candle.time,
                strengthAtr: candidateAbove ? aboveStrength : belowStrength,
                referenceAtr: atr,
                retested: false,
                retestTime: null,
            };

            return null;
        }

        const distances = getBreakoutDistances({
            candle,
            rangeState,
            breakoutSource,
        });
        const candidateDistance = candidate.direction === "ABOVE"
            ? distances.above
            : distances.below;
        const currentStrengthAtr = candidateDistance / candidate.referenceAtr;

        if (currentStrengthAtr >= strongBreakoutAtr) {
            return createSignal({
                candle,
                rangeState,
                direction: candidate.direction,
                qualification: "STRONG_BREAKOUT_AFTER_CANDIDATE",
                referenceAtr: candidate.referenceAtr,
                breakoutStrengthAtr: currentStrengthAtr,
            });
        }

        const retestedNow = !candidate.retested && isRetest({
            candle,
            rangeState,
            direction: candidate.direction,
            retestSource,
        });

        if (retestedNow) {
            candidate.retested = true;
            candidate.retestTime = candle.time;
        }

        if (!candidate.retested) {
            return null;
        }

        const continuedOutside = isOutsideRange({
            candle,
            rangeState,
            direction: candidate.direction,
            breakoutSource,
        });

        if (!continuedOutside) {
            return null;
        }

        if (retestedNow && breakoutSource === "WICK") {
            return null;
        }

        return createSignal({
            candle,
            rangeState,
            direction: candidate.direction,
            qualification: "RETEST_CONTINUATION",
            referenceAtr: candidate.referenceAtr,
            breakoutStrengthAtr: currentStrengthAtr,
        });
    }

    function getState() {
        return {
            date: currentDate,
            completed,
            candidate: candidate === null ? null : { ...candidate },
        };
    }

    return {
        reset,
        onCandle,
        getState,
    };
}
