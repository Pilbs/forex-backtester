import {
    countParameterCombinations,
    generateParameterCombinations,
} from "../research/parameter-grid.js";

const parameterGrid = {
    stopLossPips: [5, 10, 15],
    takeProfitPips: [10, 20],
    enabled: [true, false],
};

const count = countParameterCombinations(parameterGrid);
const combinations = generateParameterCombinations(parameterGrid);

if (count !== 12) {
    throw new Error(`Expected 12 combinations, received ${count}`);
}

if (combinations.length !== 12) {
    throw new Error(`Expected 12 generated combinations, received ${combinations.length}`);
}

const expected = combinations.some((config) =>
    config.stopLossPips === 15 &&
    config.takeProfitPips === 20 &&
    config.enabled === false
);

if (!expected) {
    throw new Error("Expected parameter combination was not generated");
}

console.log("Parameter grid test passed.");
