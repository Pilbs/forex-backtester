import {
    createStrategyFromDefinition,
    getStrategyDefinitionMetadata,
    resolveStrategyConfig,
} from "../strategies/strategy-definition.js";

const definition = {
    id: "ema-test",
    name: "EMA Test",
    version: 1,
    parameters: {
        fastLength: {
            type: "integer",
            default: 10,
            min: 1,
        },
        slowLength: {
            type: "integer",
            required: true,
            min: 2,
        },
        enabled: {
            type: "boolean",
            default: true,
        },
        threshold: {
            type: "number",
            default: 2,
            enabledWhen: { parameter: "enabled", equals: true },
        },
    },
    validateConfig(config) {
        return config.fastLength >= config.slowLength
            ? ["fastLength must be lower than slowLength"]
            : [];
    },
    createStrategy(config) {
        return {
            name: "EMA Test",
            config,
            onCandle() {
                return null;
            },
        };
    },
};

const config = resolveStrategyConfig({
    strategyDefinition: definition,
    strategyConfig: {
        slowLength: 30,
    },
});

if (config.fastLength !== 10 || config.slowLength !== 30 || config.enabled !== true) {
    throw new Error("Strategy defaults were not resolved correctly");
}

const created = createStrategyFromDefinition({
    strategyDefinition: definition,
    strategyConfig: {
        fastLength: 5,
        slowLength: 20,
        enabled: false,
    },
});

if (created.strategy.config.fastLength !== 5) {
    throw new Error("Strategy did not receive the resolved config");
}

const metadata = getStrategyDefinitionMetadata(definition);
const thresholdMetadata = metadata.parameters.find(
    (parameter) => parameter.id === "threshold"
);

if (
    thresholdMetadata?.enabledWhen?.parameter !== "enabled"
    || thresholdMetadata.enabledWhen.equals !== true
) {
    throw new Error("Conditional parameter metadata was not exposed correctly");
}

let unknownRejected = false;
try {
    resolveStrategyConfig({
        strategyDefinition: definition,
        strategyConfig: {
            slowLength: 30,
            unknown: 1,
        },
    });
} catch {
    unknownRejected = true;
}

if (!unknownRejected) {
    throw new Error("Unknown strategy parameter was not rejected");
}

let crossValidationRejected = false;
try {
    resolveStrategyConfig({
        strategyDefinition: definition,
        strategyConfig: {
            fastLength: 30,
            slowLength: 20,
        },
    });
} catch {
    crossValidationRejected = true;
}

if (!crossValidationRejected) {
    throw new Error("Cross-parameter validation was not enforced");
}

for (const invalidParameters of [
    {
        enabled: { type: "boolean", default: true },
        value: {
            type: "number",
            default: 1,
            enabledWhen: { parameter: "missing", equals: true },
        },
    },
    {
        first: {
            type: "boolean",
            default: true,
            enabledWhen: { parameter: "second", equals: true },
        },
        second: {
            type: "boolean",
            default: true,
            enabledWhen: { parameter: "first", equals: true },
        },
    },
]) {
    let dependencyRejected = false;

    try {
        getStrategyDefinitionMetadata({ ...definition, parameters: invalidParameters });
    } catch {
        dependencyRejected = true;
    }

    if (!dependencyRejected) {
        throw new Error("Invalid strategy parameter dependency was not rejected");
    }
}

console.log("Strategy definition test passed.");
