import { planParameterSweep } from "../research/experiment-planner.js";

const definition = {
    id: "planner-test",
    name: "Planner Test",
    createStrategy() {
        return {
            onCandle() {
                return null;
            },
        };
    },
    parameters: {
        fast: {
            type: "integer",
            default: 5,
            min: 1,
        },
        slow: {
            type: "integer",
            default: 20,
            min: 2,
        },
    },
    validateConfig(config) {
        return config.fast >= config.slow
            ? ["fast must be lower than slow"]
            : [];
    },
};

const warningPlan = planParameterSweep({
    strategyDefinition: definition,
    parameterGrid: {
        fast: [5, 10],
        slow: [15, 20],
    },
    policy: {
        warningRunCount: 3,
        maximumRunCount: 10,
    },
});

if (!warningPlan.allowed || warningPlan.requestedCombinations !== 4 || !warningPlan.warning) {
    throw new Error("Warning plan was not calculated correctly");
}

const limitedPlan = planParameterSweep({
    strategyDefinition: definition,
    parameterGrid: {
        fast: [1, 2, 3],
        slow: [10, 20],
    },
    policy: {
        warningRunCount: 2,
        maximumRunCount: 5,
    },
});

if (limitedPlan.allowed || limitedPlan.requestedCombinations !== 6) {
    throw new Error("Hard run limit was not enforced");
}

const overridePlan = planParameterSweep({
    strategyDefinition: definition,
    parameterGrid: {
        fast: [1, 2, 30],
        slow: [10, 20],
    },
    policy: {
        warningRunCount: 2,
        maximumRunCount: 5,
    },
    overrideLimits: true,
});

if (!overridePlan.allowed || overridePlan.validCombinations !== 4) {
    throw new Error("Override or invalid combination filtering failed");
}

if (overridePlan.invalidCombinations.length !== 2) {
    throw new Error("Expected two invalid combinations");
}

console.log("Experiment planner test passed.");
