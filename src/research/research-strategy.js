import { createGenericStrategy, validateGenericStrategyDefinition } from "../strategies/generic/generic-strategy.js";
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

    const validatedSpec = validateGenericStrategyDefinition(strategySpec);

    return {
        id: "generic",
        name: validatedSpec.name ?? "Generic Strategy",
        version: validatedSpec.version,
        description: "Data-defined generic strategy",
        parameters: {},

        createStrategy() {
            return createGenericStrategy({
                definition: validatedSpec,
            });
        },
    };
}
