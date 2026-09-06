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
const breakoutSource = orbMetadata.parameters.find(
    (parameter) => parameter.id === "breakoutSource"
);
const timeZone = orbMetadata.parameters.find(
    (parameter) => parameter.id === "timeZone"
);

if (!breakoutSource || breakoutSource.label !== "Breakout source") {
    throw new Error("ORB parameter metadata was not exposed correctly");
}

if (!breakoutSource.options?.includes("CLOSE") || !breakoutSource.options?.includes("WICK")) {
    throw new Error("ORB option metadata was not exposed correctly");
}

if (timeZone?.sweepable !== false) {
    throw new Error("Non-sweepable ORB parameter metadata was not preserved");
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
