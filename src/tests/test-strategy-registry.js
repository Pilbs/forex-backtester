import {
    getStrategyDefinition,
    listStrategyDefinitions,
    listStrategyMetadata,
} from "../strategies/strategy-registry.js";

const simpleSmaDefinition = getStrategyDefinition("simple-sma");
const orbDefinition = getStrategyDefinition("orb");

if (
    simpleSmaDefinition.id !== "simple-sma" ||
    simpleSmaDefinition.name !== "Simple SMA"
) {
    throw new Error("Simple SMA was not resolved from the strategy registry");
}

if (orbDefinition.id !== "orb" || orbDefinition.name !== "Opening Range Breakout") {
    throw new Error("ORB was not resolved from the strategy registry");
}

const definitions = listStrategyDefinitions();

if (
    definitions.length !== 2 ||
    definitions[0] !== simpleSmaDefinition ||
    definitions[1] !== orbDefinition
) {
    throw new Error("Strategy registry did not list Simple SMA first and ORB second");
}

const metadata = listStrategyMetadata();

if (metadata.length !== 2) {
    throw new Error("Strategy metadata did not contain both registered strategies");
}

const simpleSmaMetadata = metadata.find((strategy) => strategy.id === "simple-sma");
const smaLength = simpleSmaMetadata?.parameters.find(
    (parameter) => parameter.id === "smaLength"
);

if (!smaLength || smaLength.label !== "SMA length" || smaLength.default !== 20) {
    throw new Error("Simple SMA parameter metadata was not exposed correctly");
}

const orbMetadata = metadata.find((strategy) => strategy.id === "orb");
const breakoutCondition = orbMetadata?.parameters.find(
    (parameter) => parameter.id === "breakoutCondition"
);
const timezoneMode = orbMetadata?.parameters.find(
    (parameter) => parameter.id === "timezoneMode"
);
const strategyTimeframe = orbMetadata?.parameters.find(
    (parameter) => parameter.id === "strategyTimeframe"
);
const executionTimeframe = orbMetadata?.parameters.find(
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
