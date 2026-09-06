import { orbDefinition } from "./orb/orb-definition.js";
import {
    getStrategyDefinitionMetadata,
    validateStrategyDefinition,
} from "./strategy-definition.js";

const strategyDefinitions = [
    orbDefinition,
];

const strategyDefinitionsById = new Map();

for (const strategyDefinition of strategyDefinitions) {
    validateStrategyDefinition(strategyDefinition);

    if (strategyDefinitionsById.has(strategyDefinition.id)) {
        throw new Error(`Duplicate strategy id: ${strategyDefinition.id}`);
    }

    strategyDefinitionsById.set(strategyDefinition.id, strategyDefinition);
}

export function getStrategyDefinition(strategyId) {
    if (typeof strategyId !== "string" || !strategyId.trim()) {
        throw new Error("strategyId must be a non-empty string");
    }

    const strategyDefinition = strategyDefinitionsById.get(strategyId);

    if (!strategyDefinition) {
        throw new Error(`Unknown strategy: ${strategyId}`);
    }

    return strategyDefinition;
}

export function listStrategyDefinitions() {
    return [...strategyDefinitions];
}

export function listStrategyMetadata() {
    return strategyDefinitions.map((strategyDefinition) =>
        getStrategyDefinitionMetadata(strategyDefinition)
    );
}
