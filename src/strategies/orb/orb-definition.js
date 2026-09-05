import { createOrbStrategy } from "./orb-strategy.js";

export const orbDefinition = {
    id: "orb",
    name: "Opening Range Breakout",
    version: 2,

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

        entryMode: {
            type: "string",
            label: "Entry mode",
            default: "FIRST_BREAKOUT",
            options: ["FIRST_BREAKOUT", "ATR_WEIGHTED"],
        },

        breakoutSource: {
            type: "string",
            label: "Breakout source",
            default: "CLOSE",
            options: ["CLOSE", "WICK"],
        },

        retestSource: {
            type: "string",
            label: "Retest source",
            default: "WICK",
            options: ["CLOSE", "WICK"],
        },

        atrLength: {
            type: "integer",
            label: "ATR length",
            default: 14,
            min: 1,
        },

        candidateBreakoutAtr: {
            type: "number",
            label: "Candidate breakout ATR",
            default: 0.5,
            min: 0.01,
        },

        strongBreakoutAtr: {
            type: "number",
            label: "Strong breakout ATR",
            default: 1,
            min: 0.01,
        },
    },

    validateConfig(config) {
        if (
            config.entryMode === "ATR_WEIGHTED" &&
            config.candidateBreakoutAtr >= config.strongBreakoutAtr
        ) {
            return ["candidateBreakoutAtr must be lower than strongBreakoutAtr"];
        }

        return [];
    },
};
