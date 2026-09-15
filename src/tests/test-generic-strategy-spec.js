import assert from "node:assert/strict";

import {
    getGenericStrategyParameters,
    resolveGenericStrategySpec,
} from "../strategies/generic/generic-strategy-spec.js";

const spec = {
    version: 1,
    name: "Sweepable RSI + EMA",
    side: "LONG",

    parameters: {
        rsiThreshold: {
            type: "number",
            default: 30,
            min: 0,
            max: 100,
        },
        fastEma: {
            type: "integer",
            default: 10,
            min: 1,
        },
        slowEma: {
            type: "integer",
            default: 30,
            min: 2,
        },
    },

    entry: {
        logic: "AND",
        conditions: [
            {
                type: "RSI_THRESHOLD",
                period: 14,
                operator: "BELOW",
                value: { parameter: "rsiThreshold" },
            },
            {
                type: "EMA_CROSS",
                fastPeriod: { parameter: "fastEma" },
                slowPeriod: { parameter: "slowEma" },
                direction: "ABOVE",
            },
        ],
    },
};

const parameters = getGenericStrategyParameters(spec);

assert.deepEqual(Object.keys(parameters), [
    "rsiThreshold",
    "fastEma",
    "slowEma",
]);

const resolved = resolveGenericStrategySpec(spec, {
    rsiThreshold: 25,
    fastEma: 8,
    slowEma: 21,
});

assert.equal(resolved.entry.conditions[0].value, 25);
assert.equal(resolved.entry.conditions[1].fastPeriod, 8);
assert.equal(resolved.entry.conditions[1].slowPeriod, 21);
assert.equal(Object.hasOwn(resolved, "parameters"), false);

assert.throws(
    () => getGenericStrategyParameters({
        version: 1,
        parameters: {},
        entry: {
            conditions: [
                {
                    type: "RSI_THRESHOLD",
                    period: 14,
                    operator: "BELOW",
                    value: { parameter: "missing" },
                },
            ],
        },
    }),
    /undeclared parameter/
);

assert.throws(
    () => getGenericStrategyParameters({
        version: 1,
        parameters: {
            unused: {
                type: "number",
                default: 1,
            },
        },
        entry: {
            conditions: [
                {
                    type: "RSI_THRESHOLD",
                    period: 14,
                    operator: "BELOW",
                    value: 30,
                },
            ],
        },
    }),
    /declared but not used/
);

console.log("Generic strategy spec tests passed.");
