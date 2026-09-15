import {
    createGenericStrategy,
    validateGenericStrategyDefinition,
} from "../strategies/generic/generic-strategy.js";

import {
    getGenericStrategyParameters,
    resolveGenericStrategySpec,
} from "../strategies/generic/generic-strategy-spec.js";

import { getStrategyDefinition } from "../strategies/strategy-registry.js";

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolveResearchStrategyDefinition({
    strategy,
    strategySpec,
}) {
    if (strategy !== "generic") {
        if (strategySpec !== undefined) {
            throw new Error("strategySpec is only supported when strategy is generic");
        }

        return getStrategyDefinition(strategy);
    }

    if (!isPlainObject(strategySpec)) {
        throw new Error("strategySpec is required when strategy is generic");
    }

    if (strategySpec.version !== 1) {
        throw new Error("generic strategy definition version must be 1");
    }

    if (!strategySpec.entry) {
        throw new Error("generic strategy definition entry is required");
    }

    const parameters = getGenericStrategyParameters(strategySpec);

    return {
        id: "generic",
        name: strategySpec.name ?? "Generic Strategy",
        version: strategySpec.version,
        description: "Data-defined generic strategy",
        parameters,

        validateConfig(strategyConfig) {
            try {
                const resolvedSpec = resolveGenericStrategySpec(
                    strategySpec,
                    strategyConfig
                );

                validateGenericStrategyDefinition(resolvedSpec);
                return [];
            } catch (error) {
                return [error.message];
            }
        },

        createStrategy(strategyConfig) {
            const resolvedSpec = resolveGenericStrategySpec(
                strategySpec,
                strategyConfig
            );

            return createGenericStrategy({
                definition: resolvedSpec,
            });
        },
    };
}
