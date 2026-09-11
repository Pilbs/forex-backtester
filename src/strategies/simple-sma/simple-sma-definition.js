import { createSimpleSmaStrategy } from "./simple-sma-strategy.js";

export const simpleSmaDefinition = {
    id: "simple-sma",
    name: "Simple SMA",
    version: 1,
    description: "Enters long when the strategy candle closes above its SMA and exits when it closes below.",

    createStrategy: createSimpleSmaStrategy,

    parameters: {
        smaLength: {
            type: "integer",
            label: "SMA length",
            description: "Number of completed strategy candles used by the simple moving average.",
            default: 20,
            min: 2,
        },
    },
};
