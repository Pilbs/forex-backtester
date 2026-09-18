import {
    getStrategyDefinition,
    listStrategyDefinitions,
    listStrategyMetadata,
} from "../strategies/strategy-registry.js";

const simpleSmaDefinition = getStrategyDefinition("simple-sma");
const orbDefinition = getStrategyDefinition("orb");
const structuralIntradayDefinition = getStrategyDefinition("structural-intraday");

if (
    simpleSmaDefinition.id !== "simple-sma" ||
    simpleSmaDefinition.name !== "Simple SMA"
) {
    throw new Error("Simple SMA was not resolved from the strategy registry");
}

if (orbDefinition.id !== "orb" || orbDefinition.name !== "Opening Range Breakout") {
    throw new Error("ORB was not resolved from the strategy registry");
}

if (
    structuralIntradayDefinition.id !== "structural-intraday"
    || structuralIntradayDefinition.name !== "Structural Intraday"
) {
    throw new Error("Structural Intraday was not resolved from the strategy registry");
}

const definitions = listStrategyDefinitions();

if (
    definitions.length !== 3 ||
    definitions[0] !== simpleSmaDefinition ||
    definitions[1] !== orbDefinition ||
    definitions[2] !== structuralIntradayDefinition
) {
    throw new Error("Strategy registry order is not Simple SMA, ORB, Structural Intraday");
}

const metadata = listStrategyMetadata();

if (metadata.length !== 3) {
    throw new Error("Strategy metadata did not contain all registered strategies");
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
const breakoutDistanceMode = orbMetadata?.parameters.find(
    (parameter) => parameter.id === "breakoutDistanceMode"
);
const tpProgressTarget = orbMetadata?.parameters.find(
    (parameter) => parameter.id === "tpProgressTargetPct"
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

if (breakoutDistanceMode?.enabledWhen?.parameter !== "breakoutDistanceEntryEnabled") {
    throw new Error("ORB breakout-distance dependency metadata was not exposed");
}

if (
    !Array.isArray(tpProgressTarget?.enabledWhen)
    || tpProgressTarget.enabledWhen.length !== 2
) {
    throw new Error("ORB chained TP-progression dependencies were not exposed");
}

const structuralMetadata = metadata.find(
    (strategy) => strategy.id === "structural-intraday"
);
const structuralLongMin = structuralMetadata?.parameters.find(
    (parameter) => parameter.id === "longRangePositionMin"
);
const structuralStopLoss = structuralMetadata?.parameters.find(
    (parameter) => parameter.id === "stopLossPips"
);

if (
    !structuralLongMin
    || structuralLongMin.default !== 0.080119
    || structuralLongMin.enabledWhen?.parameter !== "longEnabled"
) {
    throw new Error("Structural Intraday long-regime metadata was not exposed correctly");
}

if (structuralStopLoss?.enabledWhen?.parameter !== "stopLossEnabled") {
    throw new Error("Structural Intraday stop-loss dependency metadata was not exposed");
}

if (
    structuralMetadata?.marketRequirements?.strategyTimeframe !== "M1"
    || structuralMetadata?.marketRequirements?.executionTimeframe !== "M1"
) {
    throw new Error("Structural Intraday M1 requirements were not exposed");
}

if (
    orbMetadata?.marketRequirements?.strategyTimeframe !== "M5"
    || orbMetadata?.marketRequirements?.executionTimeframe !== "M5"
) {
    throw new Error("ORB commissioning timeframe requirements were not exposed");
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
