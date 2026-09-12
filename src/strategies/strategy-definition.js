import { validateStrategy } from "./strategy-interface.js";

const PARAMETER_TYPES = new Set(["number", "integer", "string", "boolean"]);

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateOptionalText(value, name) {
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
        throw new Error(`${name} must be a non-empty string`);
    }
}

function parameterConditions(definition) {
    if (definition.enabledWhen === undefined) {
        return [];
    }

    return Array.isArray(definition.enabledWhen)
        ? definition.enabledWhen
        : [definition.enabledWhen];
}

function validateParameterValue(name, value, definition) {
    if (definition.type === "number" && !Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number`);
    }

    if (definition.type === "integer" && !Number.isInteger(value)) {
        throw new Error(`${name} must be an integer`);
    }

    if (definition.type === "string" && typeof value !== "string") {
        throw new Error(`${name} must be a string`);
    }

    if (definition.type === "boolean" && typeof value !== "boolean") {
        throw new Error(`${name} must be a boolean`);
    }

    if (definition.options && !definition.options.some((option) => Object.is(option, value))) {
        throw new Error(`${name} must be one of: ${definition.options.join(", ")}`);
    }

    if (definition.min !== undefined && value < definition.min) {
        throw new Error(`${name} must be at least ${definition.min}`);
    }

    if (definition.max !== undefined && value > definition.max) {
        throw new Error(`${name} must be no more than ${definition.max}`);
    }
}

export function validateStrategyDefinition(strategyDefinition) {
    if (!isPlainObject(strategyDefinition)) {
        throw new Error("strategyDefinition must be an object");
    }

    if (typeof strategyDefinition.id !== "string" || !strategyDefinition.id.trim()) {
        throw new Error("strategyDefinition.id must be a non-empty string");
    }

    if (typeof strategyDefinition.name !== "string" || !strategyDefinition.name.trim()) {
        throw new Error("strategyDefinition.name must be a non-empty string");
    }

    validateOptionalText(strategyDefinition.description, "strategyDefinition.description");

    if (strategyDefinition.version !== undefined && !Number.isInteger(strategyDefinition.version)) {
        throw new Error("strategyDefinition.version must be an integer");
    }

    if (typeof strategyDefinition.createStrategy !== "function") {
        throw new Error("strategyDefinition.createStrategy must be a function");
    }

    if (!isPlainObject(strategyDefinition.parameters)) {
        throw new Error("strategyDefinition.parameters must be an object");
    }

    for (const [name, definition] of Object.entries(strategyDefinition.parameters)) {
        if (!isPlainObject(definition)) {
            throw new Error(`Parameter definition for ${name} must be an object`);
        }

        if (!PARAMETER_TYPES.has(definition.type)) {
            throw new Error(`Parameter ${name}.type must be number, integer, string or boolean`);
        }

        validateOptionalText(definition.label, `Parameter ${name}.label`);
        validateOptionalText(definition.description, `Parameter ${name}.description`);

        if (definition.required !== undefined && typeof definition.required !== "boolean") {
            throw new Error(`Parameter ${name}.required must be a boolean`);
        }

        if (definition.sweepable !== undefined && typeof definition.sweepable !== "boolean") {
            throw new Error(`Parameter ${name}.sweepable must be a boolean`);
        }

        if (definition.options !== undefined) {
            if (!Array.isArray(definition.options) || definition.options.length === 0) {
                throw new Error(`Parameter ${name}.options must be a non-empty array`);
            }

            for (const option of definition.options) {
                validateParameterValue(name, option, {
                    ...definition,
                    options: undefined,
                });
            }
        }

        if (definition.default !== undefined) {
            validateParameterValue(name, definition.default, definition);
        }
    }

    for (const [name, definition] of Object.entries(strategyDefinition.parameters)) {
        const conditions = parameterConditions(definition);

        if (definition.enabledWhen !== undefined && conditions.length === 0) {
            throw new Error(`Parameter ${name}.enabledWhen must contain at least one condition`);
        }

        for (const condition of conditions) {
            if (!isPlainObject(condition)) {
                throw new Error(`Parameter ${name}.enabledWhen conditions must be objects`);
            }

            if (typeof condition.parameter !== "string" || !condition.parameter.trim()) {
                throw new Error(`Parameter ${name}.enabledWhen.parameter must be a non-empty string`);
            }

            const controller = strategyDefinition.parameters[condition.parameter];

            if (!controller) {
                throw new Error(
                    `Parameter ${name}.enabledWhen references unknown parameter ${condition.parameter}`
                );
            }

            if (condition.parameter === name) {
                throw new Error(`Parameter ${name}.enabledWhen cannot reference itself`);
            }

            if (!Object.hasOwn(condition, "equals")) {
                throw new Error(`Parameter ${name}.enabledWhen.equals is required`);
            }

            validateParameterValue(condition.parameter, condition.equals, controller);
        }
    }

    const dependencyState = new Map();

    function visitDependency(name) {
        const state = dependencyState.get(name);

        if (state === "visiting") {
            throw new Error(`Strategy parameter dependencies contain a cycle at ${name}`);
        }

        if (state === "visited") {
            return;
        }

        dependencyState.set(name, "visiting");

        for (const condition of parameterConditions(strategyDefinition.parameters[name])) {
            visitDependency(condition.parameter);
        }

        dependencyState.set(name, "visited");
    }

    for (const name of Object.keys(strategyDefinition.parameters)) {
        visitDependency(name);
    }

    if (
        strategyDefinition.validateConfig !== undefined &&
        typeof strategyDefinition.validateConfig !== "function"
    ) {
        throw new Error("strategyDefinition.validateConfig must be a function");
    }

    return strategyDefinition;
}

export function getStrategyDefinitionMetadata(strategyDefinition) {
    validateStrategyDefinition(strategyDefinition);

    const parameters = Object.entries(strategyDefinition.parameters).map(([id, definition]) => {
        const metadata = {
            id,
            type: definition.type,
            label: definition.label ?? id,
            required: definition.required === true,
            sweepable: definition.sweepable !== false,
        };

        if (definition.description !== undefined) {
            metadata.description = definition.description;
        }

        if (Object.hasOwn(definition, "default")) {
            metadata.default = definition.default;
        }

        if (definition.options !== undefined) {
            metadata.options = [...definition.options];
        }

        if (definition.min !== undefined) {
            metadata.min = definition.min;
        }

        if (definition.max !== undefined) {
            metadata.max = definition.max;
        }

        if (definition.enabledWhen !== undefined) {
            const conditions = parameterConditions(definition).map((condition) => ({
                parameter: condition.parameter,
                equals: condition.equals,
            }));
            metadata.enabledWhen = Array.isArray(definition.enabledWhen)
                ? conditions
                : conditions[0];
        }

        return metadata;
    });

    const metadata = {
        id: strategyDefinition.id,
        name: strategyDefinition.name,
        version: strategyDefinition.version ?? null,
        parameters,
    };

    if (strategyDefinition.description !== undefined) {
        metadata.description = strategyDefinition.description;
    }

    return metadata;
}

export function resolveStrategyConfig({
    strategyDefinition,
    strategyConfig = {},
}) {
    validateStrategyDefinition(strategyDefinition);

    if (!isPlainObject(strategyConfig)) {
        throw new Error("strategyConfig must be an object");
    }

    const parameterDefinitions = strategyDefinition.parameters;
    const unknownParameters = Object.keys(strategyConfig).filter(
        (name) => !Object.hasOwn(parameterDefinitions, name)
    );

    if (unknownParameters.length > 0) {
        throw new Error(`Unsupported strategy parameter(s): ${unknownParameters.join(", ")}`);
    }

    const resolvedConfig = {};

    for (const [name, definition] of Object.entries(parameterDefinitions)) {
        const supplied = Object.hasOwn(strategyConfig, name);
        const hasDefault = Object.hasOwn(definition, "default");

        if (!supplied && !hasDefault) {
            if (definition.required) {
                throw new Error(`${name} is required`);
            }
            continue;
        }

        const value = supplied ? strategyConfig[name] : definition.default;

        validateParameterValue(name, value, definition);
        resolvedConfig[name] = value;
    }

    if (strategyDefinition.validateConfig) {
        const validationErrors = strategyDefinition.validateConfig(resolvedConfig) ?? [];

        if (!Array.isArray(validationErrors)) {
            throw new Error("strategyDefinition.validateConfig must return an array of errors");
        }

        if (validationErrors.length > 0) {
            throw new Error(validationErrors.join("; "));
        }
    }

    return resolvedConfig;
}

export function createStrategyFromDefinition({
    strategyDefinition,
    strategyConfig,
}) {
    const resolvedConfig = resolveStrategyConfig({
        strategyDefinition,
        strategyConfig,
    });

    const strategy = strategyDefinition.createStrategy(resolvedConfig);

    validateStrategy(strategy);

    return {
        strategy,
        strategyConfig: resolvedConfig,
    };
}
