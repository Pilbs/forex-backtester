export const genericStrategyBuilderMetadata = {
    id: "generic",
    name: "Generic Strategy",
    version: 1,
    description: "Build a strategy from reusable conditions and sweepable parameters.",
    kind: "GENERIC_BUILDER",
    sides: ["LONG", "SHORT"],
    groupLogic: ["AND", "OR"],
    conditions: [
        {
            type: "RSI_THRESHOLD",
            name: "RSI threshold",
            description: "Match when RSI is above or below a threshold.",
            fields: [
                {
                    id: "period",
                    label: "RSI period",
                    type: "integer",
                    default: 14,
                    min: 1,
                    parameterizable: true,
                },
                {
                    id: "operator",
                    label: "Operator",
                    type: "string",
                    default: "BELOW",
                    options: ["BELOW", "ABOVE"],
                    parameterizable: false,
                },
                {
                    id: "value",
                    label: "Threshold",
                    type: "number",
                    default: 30,
                    min: 0,
                    max: 100,
                    parameterizable: true,
                },
            ],
        },
        {
            type: "EMA_CROSS",
            name: "EMA crossover",
            description: "Match when a fast EMA crosses above or below a slow EMA.",
            fields: [
                {
                    id: "fastPeriod",
                    label: "Fast EMA period",
                    type: "integer",
                    default: 10,
                    min: 1,
                    parameterizable: true,
                },
                {
                    id: "slowPeriod",
                    label: "Slow EMA period",
                    type: "integer",
                    default: 30,
                    min: 2,
                    parameterizable: true,
                },
                {
                    id: "direction",
                    label: "Direction",
                    type: "string",
                    default: "ABOVE",
                    options: ["ABOVE", "BELOW"],
                    parameterizable: false,
                },
            ],
        },
    ],
};

export function getGenericStrategyBuilderMetadata() {
    return structuredClone(genericStrategyBuilderMetadata);
}
