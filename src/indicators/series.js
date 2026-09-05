function validateBarCount(value, name) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer`);
    }
}

function validateValues(values, name = "values") {
    if (!Array.isArray(values)) {
        throw new Error(`${name} must be an array`);
    }

    for (const value of values) {
        if (!Number.isFinite(value)) {
            throw new Error(`${name} must contain only finite numbers`);
        }
    }
}

export function trueRange({
    high,
    low,
    previousClose = null,
}) {
    if (!Number.isFinite(high) || !Number.isFinite(low)) {
        throw new Error("high and low must be finite numbers");
    }

    if (high < low) {
        throw new Error("high cannot be below low");
    }

    if (previousClose !== null && !Number.isFinite(previousClose)) {
        throw new Error("previousClose must be a finite number or null");
    }

    if (previousClose === null) {
        return high - low;
    }

    return Math.max(
        high - low,
        Math.abs(high - previousClose),
        Math.abs(low - previousClose)
    );
}

export function crossover(previousA, currentA, previousB, currentB) {
    if (![previousA, currentA, previousB, currentB].every(Number.isFinite)) {
        return false;
    }

    return previousA <= previousB && currentA > currentB;
}

export function crossunder(previousA, currentA, previousB, currentB) {
    if (![previousA, currentA, previousB, currentB].every(Number.isFinite)) {
        return false;
    }

    return previousA >= previousB && currentA < currentB;
}

export function pivotHigh(values, leftBars, rightBars) {
    validateValues(values);
    validateBarCount(leftBars, "leftBars");
    validateBarCount(rightBars, "rightBars");

    const requiredValues = leftBars + rightBars + 1;

    if (values.length < requiredValues) {
        return null;
    }

    const window = values.slice(-requiredValues);
    const pivotIndex = leftBars;
    const pivot = window[pivotIndex];

    for (let index = 0; index < window.length; index++) {
        if (index !== pivotIndex && pivot <= window[index]) {
            return null;
        }
    }

    return pivot;
}

export function pivotLow(values, leftBars, rightBars) {
    validateValues(values);
    validateBarCount(leftBars, "leftBars");
    validateBarCount(rightBars, "rightBars");

    const requiredValues = leftBars + rightBars + 1;

    if (values.length < requiredValues) {
        return null;
    }

    const window = values.slice(-requiredValues);
    const pivotIndex = leftBars;
    const pivot = window[pivotIndex];

    for (let index = 0; index < window.length; index++) {
        if (index !== pivotIndex && pivot >= window[index]) {
            return null;
        }
    }

    return pivot;
}
