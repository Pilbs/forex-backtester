import { validateStrategy } from "./strategy-interface.js";

const PARAMETER_TYPES = new Set(["number", "integer", "string", "boolean"]);

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
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

    if (strategyDefinition.version !== undefined && !Number.isInteger(strategyDefinition.version)) {
        throw new Error("strategyDefinition.version must be an integer");
    }

    if (typeof strategyDefinition.createStrategy !== "function") {
        throw new Error("strategyDefinition.createStrategy must be a function");
    }

    if (!isPlainObject(strategyDefinition.parameters)) {
        throw new Error("strategyDefinition.parameters must be an object");
    }

    for (const [name, parameterDefinition] of Object.entries(strategyDefinition.parameters)) {
        if (!isPlainObject(parameterDefinition)) {
            throw new Error(`Parameter definition for ${name} must be an object`);
        }

        if (!PARAMETER_TYPES.has(parameterDefinition.type)) {
            throw new Error(
                `Parameter ${name}.type must be number, integer, string or boolean`
            );
        }

        if (parameterDefinition.options !== undefined) {
            if (!Array.isArray(parameterDefinition.options) || parameterDefinition.options.length === 0) {
                throw new Error(`Parameter ${name}.options must be a non-empty array`);
            }

            for (const option of parameterDefinition.options) {
                validateParameterValue(name, option, {
                    ...parameterDefinition,
                    options: undefined,
                });
            }
        }

        if (parameterDefinition.default !== undefined) {
            validateParameterValue(name, parameterDefinition.default, parameterDefinition);
        }
    }

    if (
        strategyDefinition.validateConfig !== undefined &&
        typeof strategyDefinition.validateConfig !== "function"
    ) {
        throw new Error("strategyDefinition.validateConfig must be a function");
    }

    return strategyDefinition;
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

    for (const [name, parameterDefinition] of Object.entries(parameterDefinitions)) {
        const supplied = Object.hasOwn(strategyConfig, name);
        const hasDefault = Object.hasOwn(parameterDefinition, "default");

        if (!supplied && !hasDefault) {
            if (parameterDefinition.required) {
                throw new Error(`${name} is required`);
            }
            continue;
        }

        const value = supplied ? strategyConfig[name] : parameterDefinition.default;
        validateParameterValue(name, value, parameterDefinition);
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
