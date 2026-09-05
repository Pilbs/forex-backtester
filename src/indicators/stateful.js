import { trueRange } from "./series.js";

function validatePeriod(period) {
    if (!Number.isInteger(period) || period <= 0) {
        throw new Error("period must be a positive integer");
    }
}

function validateValue(value) {
    if (!Number.isFinite(value)) {
        throw new Error("Indicator value must be a finite number");
    }
}

function createSeededAverage(period, alpha) {
    validatePeriod(period);

    let seedValues = [];
    let currentValue = null;

    function next(value) {
        validateValue(value);

        if (currentValue === null) {
            seedValues.push(value);

            if (seedValues.length < period) {
                return null;
            }

            currentValue = seedValues.reduce((total, item) => total + item, 0) / period;
            seedValues = [];
            return currentValue;
        }

        currentValue = alpha * value + (1 - alpha) * currentValue;
        return currentValue;
    }

    function reset() {
        seedValues = [];
        currentValue = null;
    }

    return {
        next,
        reset,
        get value() {
            return currentValue;
        },
    };
}

function createRollingWindow(period, calculate) {
    validatePeriod(period);

    const values = [];
    let currentValue = null;

    function next(value) {
        validateValue(value);

        values.push(value);

        if (values.length > period) {
            values.shift();
        }

        if (values.length < period) {
            currentValue = null;
            return null;
        }

        currentValue = calculate(values);
        return currentValue;
    }

    function reset() {
        values.length = 0;
        currentValue = null;
    }

    return {
        next,
        reset,
        get value() {
            return currentValue;
        },
    };
}

export function createSma(period) {
    return createRollingWindow(
        period,
        (values) => values.reduce((total, value) => total + value, 0) / values.length
    );
}

export function createEma(period) {
    validatePeriod(period);
    return createSeededAverage(period, 2 / (period + 1));
}

export function createRma(period) {
    validatePeriod(period);
    return createSeededAverage(period, 1 / period);
}

export function createRollingHighest(period) {
    return createRollingWindow(period, (values) => Math.max(...values));
}

export function createRollingLowest(period) {
    return createRollingWindow(period, (values) => Math.min(...values));
}

export function createRollingStandardDeviation(period, {
    sample = false,
} = {}) {
    validatePeriod(period);

    if (sample && period < 2) {
        throw new Error("Sample standard deviation requires period >= 2");
    }

    return createRollingWindow(period, (values) => {
        const mean = values.reduce((total, value) => total + value, 0) / values.length;
        const squaredDifferences = values.reduce(
            (total, value) => total + (value - mean) ** 2,
            0
        );
        const denominator = sample ? values.length - 1 : values.length;

        return Math.sqrt(squaredDifferences / denominator);
    });
}

export function createAtr(period, {
    price = "mid",
} = {}) {
    validatePeriod(period);

    const average = createRma(period);
    let previousClose = null;
    let currentValue = null;

    function next(candle) {
        const prices = candle?.[price];

        if (!prices) {
            throw new Error(`Candle does not contain ${price} prices`);
        }

        const range = trueRange({
            high: prices.high,
            low: prices.low,
            previousClose,
        });

        previousClose = prices.close;
        currentValue = average.next(range);

        return currentValue;
    }

    function reset() {
        average.reset();
        previousClose = null;
        currentValue = null;
    }

    return {
        next,
        reset,
        get value() {
            return currentValue;
        },
    };
}

export function createRsi(period) {
    validatePeriod(period);

    const averageGain = createRma(period);
    const averageLoss = createRma(period);

    let previousValue = null;
    let currentValue = null;

    function next(value) {
        validateValue(value);

        if (previousValue === null) {
            previousValue = value;
            return null;
        }

        const change = value - previousValue;
        previousValue = value;

        const gain = Math.max(change, 0);
        const loss = Math.max(-change, 0);

        const averageGainValue = averageGain.next(gain);
        const averageLossValue = averageLoss.next(loss);

        if (averageGainValue === null || averageLossValue === null) {
            return null;
        }

        if (averageGainValue === 0 && averageLossValue === 0) {
            currentValue = 50;
        } else if (averageLossValue === 0) {
            currentValue = 100;
        } else if (averageGainValue === 0) {
            currentValue = 0;
        } else {
            const relativeStrength = averageGainValue / averageLossValue;
            currentValue = 100 - 100 / (1 + relativeStrength);
        }

        return currentValue;
    }

    function reset() {
        averageGain.reset();
        averageLoss.reset();

        previousValue = null;
        currentValue = null;
    }

    return {
        next,
        reset,
        get value() {
            return currentValue;
        },
    };
}
