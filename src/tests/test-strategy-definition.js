import {
    createStrategyFromDefinition,
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

console.log("Strategy definition test passed.");
