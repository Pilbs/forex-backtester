import { validateStrategyDefinition } from "../strategies/strategy-definition.js";

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateParameterGrid({
    strategyDefinition,
    parameterGrid = {},
}) {
    validateStrategyDefinition(strategyDefinition);

    if (!isPlainObject(parameterGrid)) {
        throw new Error("parameterGrid must be an object");
    }

    for (const [parameterName, values] of Object.entries(parameterGrid)) {
        const parameterDefinition = strategyDefinition.parameters[parameterName];

        if (!parameterDefinition) {
            throw new Error(`Unsupported sweep parameter: ${parameterName}`);
        }

        if (parameterDefinition.sweepable === false) {
            throw new Error(`Parameter ${parameterName} is not sweepable`);
        }

        if (!Array.isArray(values) || values.length === 0) {
            throw new Error(`${parameterName} must contain at least one value`);
        }
    }

    return parameterGrid;
}

export function countParameterCombinations(parameterGrid = {}) {
    if (!isPlainObject(parameterGrid)) {
        throw new Error("parameterGrid must be an object");
    }

    const entries = Object.entries(parameterGrid);
    if (entries.length === 0) {
        return 1;
    }

    let total = 1;

    for (const [parameterName, values] of entries) {
        if (!Array.isArray(values) || values.length === 0) {
            throw new Error(`${parameterName} must contain at least one value`);
        }

        total *= values.length;

        if (!Number.isSafeInteger(total)) {
            throw new Error("Parameter combination count exceeds the safe integer limit");
        }
    }

    return total;
}

export function generateParameterCombinations(parameterGrid = {}) {
    if (!isPlainObject(parameterGrid)) {
        throw new Error("parameterGrid must be an object");
    }

    const entries = Object.entries(parameterGrid);
    if (entries.length === 0) {
        return [{}];
    }

    const combinations = [];

    function build(index, current) {
        if (index === entries.length) {
            combinations.push({ ...current });
            return;
        }

        const [parameterName, values] = entries[index];

        if (!Array.isArray(values) || values.length === 0) {
            throw new Error(`${parameterName} must contain at least one value`);
        }

        for (const value of values) {
            current[parameterName] = value;
            build(index + 1, current);
        }

        delete current[parameterName];
    }

    build(0, {});
    return combinations;
}
