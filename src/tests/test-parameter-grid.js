import assert from "node:assert/strict";

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

assert.equal(count, 12);
assert.equal(combinations.length, 12);

const expected = combinations.some((config) =>
    config.stopLossPips === 15 &&
    config.takeProfitPips === 20 &&
    config.enabled === false
);

assert.equal(expected, true);

assert.throws(
    () => countParameterCombinations({
        stopLossPips: [5, 10, 10],
    }),
    /duplicate sweep value/
);

assert.throws(
    () => generateParameterCombinations({
        enabled: [true, true],
    }),
    /duplicate sweep value/
);

assert.deepEqual(
    generateParameterCombinations({}),
    [{}]
);

console.log("Parameter grid test passed.");
