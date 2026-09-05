import { createOrbStrategy } from "./orb-strategy.js";

export const orbDefinition = {
    id: "orb",
    name: "Opening Range Breakout",
    version: 1,

    createStrategy: createOrbStrategy,

    parameters: {
        startHour: {
            type: "integer",
            label: "Start hour",
            default: 8,
            min: 0,
            max: 23,
        },

        startMinute: {
            type: "integer",
            label: "Start minute",
            default: 15,
            min: 0,
            max: 59,
        },

        durationMinutes: {
            type: "integer",
            label: "Opening range duration",
            default: 60,
            min: 1,
        },

        timeZone: {
            type: "string",
            label: "Time zone",
            default: "America/New_York",
        },

        stopLossPips: {
            type: "number",
            label: "Stop loss pips",
            required: true,
            min: 0.1,
        },

        takeProfitPips: {
            type: "number",
            label: "Take profit pips",
            required: true,
            min: 0.1,
        },
    },
};
