const ENTRY_SIZE_TYPES = new Set([
    "UNITS",
    "CASH",
    "PERCENT_EQUITY",
    "RISK_PERCENT",
]);

const EXIT_SIZE_TYPES = new Set([
    "UNITS",
    "PERCENT_POSITION",
]);

export function validateEntrySize(size, name = "size") {
    if (!size || typeof size !== "object" || Array.isArray(size)) {
        throw new Error(`${name} must be an object`);
    }

    if (!ENTRY_SIZE_TYPES.has(size.type)) {
        throw new Error(
            `${name}.type must be UNITS, CASH, PERCENT_EQUITY or RISK_PERCENT`
        );
    }

    if (!Number.isFinite(size.value) || size.value <= 0) {
        throw new Error(`${name}.value must be a positive number`);
    }

    if (
        (size.type === "PERCENT_EQUITY" || size.type === "RISK_PERCENT") &&
        size.value > 100
    ) {
        throw new Error(`${name}.value cannot exceed 100 percent`);
    }

    return size;
}

export function validateExitSize(size, name = "size") {
    if (!size || typeof size !== "object" || Array.isArray(size)) {
        throw new Error(`${name} must be an object`);
    }

    if (!EXIT_SIZE_TYPES.has(size.type)) {
        throw new Error(`${name}.type must be UNITS or PERCENT_POSITION`);
    }

    if (!Number.isFinite(size.value) || size.value <= 0) {
        throw new Error(`${name}.value must be a positive number`);
    }

    if (size.type === "PERCENT_POSITION" && size.value > 100) {
        throw new Error(`${name}.value cannot exceed 100 percent`);
    }

    return size;
}

export function calculateEntryUnits({
    size,
    defaultSizing,
    entryPrice,
    stopLossPrice,
    equity,
    quoteToAccountRate = 1,
    unitStep = 1,
    minimumUnits = 1,
}) {
    const resolvedSize = size ?? defaultSizing;

    validateEntrySize(resolvedSize);

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
        throw new Error("entryPrice must be a positive number");
    }

    if (!Number.isFinite(equity) || equity <= 0) {
        throw new Error("equity must be a positive number");
    }

    if (!Number.isFinite(quoteToAccountRate) || quoteToAccountRate <= 0) {
        throw new Error("quoteToAccountRate must be a positive number");
    }

    if (!Number.isFinite(unitStep) || unitStep <= 0) {
        throw new Error("unitStep must be a positive number");
    }

    if (!Number.isFinite(minimumUnits) || minimumUnits <= 0) {
        throw new Error("minimumUnits must be a positive number");
    }

    let rawUnits;

    if (resolvedSize.type === "UNITS") {
        rawUnits = resolvedSize.value;
    } else if (resolvedSize.type === "CASH") {
        rawUnits = resolvedSize.value / (entryPrice * quoteToAccountRate);
    } else if (resolvedSize.type === "PERCENT_EQUITY") {
        const notionalAmount = equity * (resolvedSize.value / 100);
        rawUnits = notionalAmount / (entryPrice * quoteToAccountRate);
    } else {
        if (!Number.isFinite(stopLossPrice) || stopLossPrice <= 0) {
            throw new Error("RISK_PERCENT sizing requires a positive stopLossPrice");
        }

        const riskPerUnit = Math.abs(entryPrice - stopLossPrice) * quoteToAccountRate;

        if (riskPerUnit === 0) {
            throw new Error("RISK_PERCENT sizing requires a non-zero stop distance");
        }

        const riskAmount = equity * (resolvedSize.value / 100);
        rawUnits = riskAmount / riskPerUnit;
    }

    const stepUnits = rawUnits / unitStep;
    const roundedUnits = Math.floor(stepUnits + 1e-9) * unitStep;

    if (!Number.isFinite(roundedUnits) || roundedUnits < minimumUnits) {
        throw new Error(
            `Calculated size ${roundedUnits} is below the minimum ${minimumUnits} units`
        );
    }

    return Number(roundedUnits.toFixed(8));
}