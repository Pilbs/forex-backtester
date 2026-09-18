function requirePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
}

function requirePositiveNumber(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive number`);
    }
}

function createEma(span) {
    requirePositiveInteger(span, "EMA span");
    const alpha = 2 / (span + 1);
    let value = null;

    return {
        reset() {
            value = null;
        },
        next(input) {
            value = value === null
                ? input
                : alpha * input + (1 - alpha) * value;
            return value;
        },
    };
}

function pushBounded(values, value, limit) {
    values.push(value);
    if (values.length > limit) values.shift();
}

function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values) {
    if (values.length < 2) return null;
    const avg = mean(values);
    const squared = values.reduce(
        (sum, value) => sum + (value - avg) ** 2,
        0
    );
    return Math.sqrt(squared / (values.length - 1));
}

function createMicroBreakout({ direction, lookback = 15 }) {
    requirePositiveInteger(lookback, "micro breakout lookback");

    const highs = [];
    const lows = [];
    let previousCondition = false;

    return {
        reset() {
            highs.length = 0;
            lows.length = 0;
            previousCondition = false;
        },

        next(candle) {
            const ready = highs.length === lookback && lows.length === lookback;
            const priorHigh = ready ? Math.max(...highs) : null;
            const priorLow = ready ? Math.min(...lows) : null;
            const close = candle.mid.close;

            const condition = ready && (
                direction === "LONG"
                    ? close > priorHigh
                    : close < priorLow
            );
            const matched = condition && !previousCondition;

            previousCondition = condition;
            pushBounded(highs, candle.mid.high, lookback);
            pushBounded(lows, candle.mid.low, lookback);

            return {
                ready,
                matched,
                metadata: {
                    type: "MICRO_BREAKOUT_15M",
                    lookback,
                    priorHigh,
                    priorLow,
                    close,
                },
            };
        },
    };
}

function createTrendPullback({
    direction,
    fastPeriod = 9,
    slowPeriod = 30,
}) {
    requirePositiveInteger(fastPeriod, "pullback fast EMA");
    requirePositiveInteger(slowPeriod, "pullback slow EMA");

    if (fastPeriod >= slowPeriod) {
        throw new Error("pullback fast EMA must be less than slow EMA");
    }

    const fast = createEma(fastPeriod);
    const slow = createEma(slowPeriod);

    let previousClose = null;
    let previousFast = null;

    return {
        reset() {
            fast.reset();
            slow.reset();
            previousClose = null;
            previousFast = null;
        },

        next(candle) {
            const close = candle.mid.close;
            const fastValue = fast.next(close);
            const slowValue = slow.next(close);
            const ready = previousClose !== null && previousFast !== null;

            const matched = ready && (
                direction === "LONG"
                    ? (
                        fastValue > slowValue
                        && previousClose <= previousFast
                        && close > fastValue
                    )
                    : (
                        fastValue < slowValue
                        && previousClose >= previousFast
                        && close < fastValue
                    )
            );

            const result = {
                ready,
                matched,
                metadata: {
                    type: "TREND_PULLBACK_RECLAIM",
                    fastPeriod,
                    slowPeriod,
                    fast: fastValue,
                    slow: slowValue,
                    close,
                },
            };

            previousClose = close;
            previousFast = fastValue;

            return result;
        },
    };
}

function createMomentumBurst({
    direction,
    returnLookback = 5,
    atrLength = 14,
    atrMultiple = 1.25,
    fastEma = 30,
    slowEma = 60,
}) {
    requirePositiveInteger(returnLookback, "momentum return lookback");
    requirePositiveInteger(atrLength, "momentum ATR length");
    requirePositiveNumber(atrMultiple, "momentum ATR multiple");
    requirePositiveInteger(fastEma, "momentum fast EMA");
    requirePositiveInteger(slowEma, "momentum slow EMA");

    if (fastEma >= slowEma) {
        throw new Error("momentum fast EMA must be less than slow EMA");
    }

    const fast = createEma(fastEma);
    const slow = createEma(slowEma);
    const closes = [];
    const trueRanges = [];

    let previousClose = null;
    let previousCondition = false;

    return {
        reset() {
            fast.reset();
            slow.reset();
            closes.length = 0;
            trueRanges.length = 0;
            previousClose = null;
            previousCondition = false;
        },

        next(candle) {
            const close = candle.mid.close;
            const fastValue = fast.next(close);
            const slowValue = slow.next(close);

            const trueRange = previousClose === null
                ? candle.mid.high - candle.mid.low
                : Math.max(
                    candle.mid.high - candle.mid.low,
                    Math.abs(candle.mid.high - previousClose),
                    Math.abs(candle.mid.low - previousClose)
                );

            pushBounded(trueRanges, trueRange, atrLength);

            const atr = trueRanges.length === atrLength
                ? mean(trueRanges)
                : null;
            const referenceClose = closes.length === returnLookback
                ? closes[0]
                : null;
            const priceMove = referenceClose === null
                ? null
                : close - referenceClose;

            const ready = Number.isFinite(atr) && referenceClose !== null;
            const condition = ready && (
                direction === "LONG"
                    ? (
                        priceMove > 0
                        && priceMove >= atrMultiple * atr
                        && fastValue > slowValue
                    )
                    : (
                        priceMove < 0
                        && -priceMove >= atrMultiple * atr
                        && fastValue < slowValue
                    )
            );
            const matched = condition && !previousCondition;

            previousCondition = condition;
            previousClose = close;
            pushBounded(closes, close, returnLookback);

            return {
                ready,
                matched,
                metadata: {
                    type: "MOMENTUM_BURST_5M",
                    returnLookback,
                    atrLength,
                    atrMultiple,
                    fastEma,
                    slowEma,
                    priceMove,
                    atr,
                    fast: fastValue,
                    slow: slowValue,
                },
            };
        },
    };
}

function createMeanReversionReclaim({
    direction,
    lookback = 20,
    zThreshold = 1.5,
}) {
    requirePositiveInteger(lookback, "mean reversion lookback");
    requirePositiveNumber(zThreshold, "mean reversion z threshold");

    const closes = [];
    let previousZ = null;

    return {
        reset() {
            closes.length = 0;
            previousZ = null;
        },

        next(candle) {
            pushBounded(closes, candle.mid.close, lookback);

            if (closes.length < lookback) {
                return {
                    ready: false,
                    matched: false,
                    metadata: {
                        type: "MEAN_REVERSION_RECLAIM",
                        lookback,
                        zThreshold,
                        z: null,
                    },
                };
            }

            const avg = mean(closes);
            const std = sampleStandardDeviation(closes);
            const z = Number.isFinite(std) && std > 0
                ? (candle.mid.close - avg) / std
                : 0;

            const ready = previousZ !== null;
            const matched = ready && (
                direction === "LONG"
                    ? previousZ <= -zThreshold && z > -zThreshold
                    : previousZ >= zThreshold && z < zThreshold
            );

            const result = {
                ready,
                matched,
                metadata: {
                    type: "MEAN_REVERSION_RECLAIM",
                    lookback,
                    zThreshold,
                    z,
                },
            };

            previousZ = z;
            return result;
        },
    };
}

export const M1_TRIGGER_TYPES = Object.freeze([
    "MICRO_BREAKOUT_15M",
    "TREND_PULLBACK_RECLAIM",
    "MOMENTUM_BURST_5M",
    "MEAN_REVERSION_RECLAIM",
]);

export function createM1Trigger({
    type,
    direction,
    momentum = {},
} = {}) {
    if (!new Set(["LONG", "SHORT"]).has(direction)) {
        throw new Error("direction must be LONG or SHORT");
    }

    switch (type) {
        case "MICRO_BREAKOUT_15M":
            return createMicroBreakout({
                direction,
                lookback: 15,
            });
        case "TREND_PULLBACK_RECLAIM":
            return createTrendPullback({
                direction,
                fastPeriod: 9,
                slowPeriod: 30,
            });
        case "MOMENTUM_BURST_5M":
            return createMomentumBurst({
                direction,
                returnLookback: momentum.returnLookback,
                atrLength: momentum.atrLength,
                atrMultiple: momentum.atrMultiple,
                fastEma: momentum.fastEma,
                slowEma: momentum.slowEma,
            });
        case "MEAN_REVERSION_RECLAIM":
            return createMeanReversionReclaim({
                direction,
                lookback: 20,
                zThreshold: 1.5,
            });
        default:
            throw new Error(`Unsupported M1 trigger type: ${type}`);
    }
}
