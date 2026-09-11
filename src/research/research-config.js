import { getStrategyDefinition } from "../strategies/strategy-registry.js";

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function copyObjectSection(config, name, { required = false } = {}) {
    const value = config[name];

    if (value === undefined) {
        if (required) {
            throw new Error(`${name} is required`);
        }

        return {};
    }

    if (!isPlainObject(value)) {
        throw new Error(`${name} must be an object`);
    }

    return { ...value };
}

function validateStrategyParameterNames({
    strategyDefinition,
    values,
    sectionName,
}) {
    const supportedParameters = strategyDefinition.parameters;
    const unknownParameters = Object.keys(values).filter(
        (name) => !Object.hasOwn(supportedParameters, name)
    );

    if (unknownParameters.length > 0) {
        throw new Error(
            `Unsupported ${sectionName} parameter(s): ${unknownParameters.join(", ")}`
        );
    }
}

function copyParameterGrid(parameterGrid) {
    const copiedGrid = {};

    for (const [name, values] of Object.entries(parameterGrid)) {
        if (!Array.isArray(values) || values.length === 0) {
            throw new Error(`parameterGrid.${name} must be a non-empty array`);
        }

        copiedGrid[name] = [...values];
    }

    return copiedGrid;
}

export function normalizeResearchConfig(config) {
    if (!isPlainObject(config)) {
        throw new Error("research config must be an object");
    }

    if (typeof config.strategy !== "string" || !config.strategy.trim()) {
        throw new Error("strategy is required");
    }

    const strategyDefinition = getStrategyDefinition(config.strategy);
    const market = copyObjectSection(config, "market", { required: true });
    const account = copyObjectSection(config, "account");
    const execution = copyObjectSection(config, "execution");
    const strategyConfig = copyObjectSection(config, "strategyConfig");
    const rawParameterGrid = copyObjectSection(config, "parameterGrid");
    const policy = copyObjectSection(config, "policy");

    validateStrategyParameterNames({
        strategyDefinition,
        values: strategyConfig,
        sectionName: "strategyConfig",
    });

    validateStrategyParameterNames({
        strategyDefinition,
        values: rawParameterGrid,
        sectionName: "parameterGrid",
    });

    const parameterGrid = copyParameterGrid(rawParameterGrid);

    return {
        strategy: strategyDefinition.id,
        market,
        account,
        execution,
        strategyConfig,
        parameterGrid,
        policy,
    };
}
