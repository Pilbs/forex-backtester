import {
    getStrategyDefinition,
    listStrategyDefinitions,
    listStrategyMetadata,
} from "../strategies/strategy-registry.js";

const orbDefinition = getStrategyDefinition("orb");

if (orbDefinition.id !== "orb" || orbDefinition.name !== "Opening Range Breakout") {
    throw new Error("ORB was not resolved from the strategy registry");
}

const definitions = listStrategyDefinitions();

if (definitions.length !== 1 || definitions[0] !== orbDefinition) {
    throw new Error("Strategy registry did not list the registered ORB definition");
}

const metadata = listStrategyMetadata();

if (metadata.length !== 1) {
    throw new Error("Strategy metadata did not contain exactly one registered strategy");
}

const orbMetadata = metadata[0];
const breakoutCondition = orbMetadata.parameters.find(
    (parameter) => parameter.id === "breakoutCondition"
);
const timezoneMode = orbMetadata.parameters.find(
    (parameter) => parameter.id === "timezoneMode"
);
const strategyTimeframe = orbMetadata.parameters.find(
    (parameter) => parameter.id === "strategyTimeframe"
);
const executionTimeframe = orbMetadata.parameters.find(
    (parameter) => parameter.id === "executionTimeframe"
);

if (!breakoutCondition || breakoutCondition.label !== "Breakout condition") {
    throw new Error("ORB breakout-condition metadata was not exposed correctly");
}

if (
    !breakoutCondition.options?.includes("CLOSE") ||
    !breakoutCondition.options?.includes("WICK")
) {
    throw new Error("ORB breakout-condition options were not exposed correctly");
}

if (
    !timezoneMode?.options?.includes("EXCHANGE") ||
    !timezoneMode.options.includes("NEW_YORK") ||
    !timezoneMode.options.includes("LONDON") ||
    !timezoneMode.options.includes("UTC")
) {
    throw new Error("ORB timezone metadata was not exposed correctly");
}

if (strategyTimeframe || executionTimeframe) {
    throw new Error("Strategy/execution timeframe must remain platform settings, not ORB parameters");
}

const serialized = JSON.stringify(metadata);

if (serialized.includes("createStrategy")) {
    throw new Error("Strategy metadata must not expose runtime functions");
}

let unknownRejected = false;
try {
    getStrategyDefinition("does-not-exist");
} catch {
    unknownRejected = true;
}

if (!unknownRejected) {
    throw new Error("Unknown strategy id was not rejected");
}

console.log("Strategy registry test passed.");
