import { validateStrategyDefinition } from "../strategies/strategy-definition.js";

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateGridShape(parameterGrid) {
    if (!isPlainObject(parameterGrid)) {
        throw new Error("parameterGrid must be an object");
    }

    for (const [parameterName, values] of Object.entries(parameterGrid)) {
        if (!Array.isArray(values) || values.length === 0) {
            throw new Error(`${parameterName} must contain at least one value`);
        }

        for (let index = 0; index < values.length; index++) {
            const duplicateIndex = values.findIndex(
                (value, candidateIndex) =>
                    candidateIndex < index &&
                    Object.is(value, values[index])
            );

            if (duplicateIndex >= 0) {
                throw new Error(
                    `${parameterName} contains duplicate sweep value: ${String(values[index])}`
                );
            }
        }
    }

    return parameterGrid;
}

export function validateParameterGrid({
    strategyDefinition,
    parameterGrid = {},
}) {
    validateStrategyDefinition(strategyDefinition);
    validateGridShape(parameterGrid);

    for (const parameterName of Object.keys(parameterGrid)) {
        const parameterDefinition = strategyDefinition.parameters[parameterName];

        if (!parameterDefinition) {
            throw new Error(`Unsupported sweep parameter: ${parameterName}`);
        }

        if (parameterDefinition.sweepable === false) {
            throw new Error(`Parameter ${parameterName} is not sweepable`);
        }
    }

    return parameterGrid;
}

export function countParameterCombinations(parameterGrid = {}) {
    validateGridShape(parameterGrid);

    const entries = Object.entries(parameterGrid);

    if (entries.length === 0) {
        return 1;
    }

    let total = 1;

    for (const [, values] of entries) {
        total *= values.length;

        if (!Number.isSafeInteger(total)) {
            throw new Error("Parameter combination count exceeds the safe integer limit");
        }
    }

    return total;
}

export function generateParameterCombinations(parameterGrid = {}) {
    validateGridShape(parameterGrid);

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

        for (const value of values) {
            current[parameterName] = value;
            build(index + 1, current);
        }

        delete current[parameterName];
    }

    build(0, {});

    return combinations;
}
