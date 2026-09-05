import {
    resolveStrategyConfig,
    validateStrategyDefinition,
} from "../strategies/strategy-definition.js";

import {
    countParameterCombinations,
    generateParameterCombinations,
    validateParameterGrid,
} from "./parameter-grid.js";

const DEFAULT_POLICY = {
    warningRunCount: 250,
    maximumRunCount: 5000,
};

function resolvePolicy(policy = {}) {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
        throw new Error("policy must be an object");
    }

    const resolved = {
        ...DEFAULT_POLICY,
        ...policy,
    };

    if (!Number.isInteger(resolved.warningRunCount) || resolved.warningRunCount < 1) {
        throw new Error("policy.warningRunCount must be a positive integer");
    }

    if (!Number.isInteger(resolved.maximumRunCount) || resolved.maximumRunCount < 1) {
        throw new Error("policy.maximumRunCount must be a positive integer");
    }

    if (resolved.warningRunCount > resolved.maximumRunCount) {
        throw new Error("policy.warningRunCount cannot exceed policy.maximumRunCount");
    }

    return resolved;
}

export function planParameterSweep({
    strategyDefinition,
    baseStrategyConfig = {},
    parameterGrid = {},
    policy = {},
    overrideLimits = false,
}) {
    validateStrategyDefinition(strategyDefinition);
    validateParameterGrid({
        strategyDefinition,
        parameterGrid,
    });

    const resolvedPolicy = resolvePolicy(policy);
    const resolvedBaseStrategyConfig = resolveStrategyConfig({
        strategyDefinition,
        strategyConfig: baseStrategyConfig,
    });
    const requestedCombinations = countParameterCombinations(parameterGrid);
    const exceedsWarning = requestedCombinations > resolvedPolicy.warningRunCount;
    const exceedsMaximum = requestedCombinations > resolvedPolicy.maximumRunCount;
    const allowedByLimit = !exceedsMaximum || overrideLimits;

    const warning = exceedsWarning
        ? `Experiment requests ${requestedCombinations} runs; warning threshold is ${resolvedPolicy.warningRunCount}`
        : null;

    if (!allowedByLimit) {
        return {
            schemaVersion: 1,
            strategy: {
                id: strategyDefinition.id,
                name: strategyDefinition.name,
                version: strategyDefinition.version ?? 1,
            },
            baseStrategyConfig: resolvedBaseStrategyConfig,
            parameterGrid,
            policy: resolvedPolicy,
            overrideLimits,
            requestedCombinations,
            validCombinations: 0,
            invalidCombinations: [],
            configurations: [],
            warning,
            allowed: false,
            rejectionReason:
                `Experiment requests ${requestedCombinations} runs; maximum permitted is ${resolvedPolicy.maximumRunCount}`,
        };
    }

    const parameterCombinations = generateParameterCombinations(parameterGrid);
    const configurations = [];
    const invalidCombinations = [];

    for (const parameterValues of parameterCombinations) {
        try {
            const strategyConfig = resolveStrategyConfig({
                strategyDefinition,
                strategyConfig: {
                    ...resolvedBaseStrategyConfig,
                    ...parameterValues,
                },
            });

            configurations.push({
                runNumber: configurations.length + 1,
                parameterValues: { ...parameterValues },
                strategyConfig,
            });
        } catch (error) {
            invalidCombinations.push({
                parameterValues: { ...parameterValues },
                reason: error.message,
            });
        }
    }

    const allowed = configurations.length > 0;

    return {
        schemaVersion: 1,
        strategy: {
            id: strategyDefinition.id,
            name: strategyDefinition.name,
            version: strategyDefinition.version ?? 1,
        },
        baseStrategyConfig: resolvedBaseStrategyConfig,
        parameterGrid,
        policy: resolvedPolicy,
        overrideLimits,
        requestedCombinations,
        validCombinations: configurations.length,
        invalidCombinations,
        configurations,
        warning,
        allowed,
        rejectionReason: allowed ? null : "No valid parameter combinations remain",
    };
}
