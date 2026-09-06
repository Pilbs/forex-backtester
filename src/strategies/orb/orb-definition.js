import { createOrbStrategy } from "./orb-strategy.js";

export const orbDefinition = {
    id: "orb",
    name: "Opening Range Breakout",
    version: 2,
    description: "Builds a daily opening range and enters on a qualifying breakout.",

    createStrategy: createOrbStrategy,

    parameters: {
        startHour: {
            type: "integer",
            label: "Start hour",
            description: "Opening range start hour in the configured time zone.",
            default: 8,
            min: 0,
            max: 23,
        },

        startMinute: {
            type: "integer",
            label: "Start minute",
            description: "Opening range start minute in the configured time zone.",
            default: 15,
            min: 0,
            max: 59,
        },

        durationMinutes: {
            type: "integer",
            label: "Opening range duration",
            description: "Number of minutes used to build the opening range.",
            default: 60,
            min: 1,
        },

        timeZone: {
            type: "string",
            label: "Time zone",
            description: "IANA time zone used for the daily opening range.",
            default: "America/New_York",
            sweepable: false,
        },

        stopLossPips: {
            type: "number",
            label: "Stop loss pips",
            description: "Protective stop distance from entry in pips.",
            required: true,
            min: 0.1,
        },

        takeProfitPips: {
            type: "number",
            label: "Take profit pips",
            description: "Take-profit distance from entry in pips.",
            required: true,
            min: 0.1,
        },

        entryMode: {
            type: "string",
            label: "Entry mode",
            description: "Rule used to qualify the daily opening-range breakout.",
            default: "FIRST_BREAKOUT",
            options: ["FIRST_BREAKOUT", "ATR_WEIGHTED"],
        },

        breakoutSource: {
            type: "string",
            label: "Breakout source",
            description: "Whether ATR-weighted breakout distance uses candle close or wick.",
            default: "CLOSE",
            options: ["CLOSE", "WICK"],
        },

        retestSource: {
            type: "string",
            label: "Retest source",
            description: "Whether an ATR-weighted retest is confirmed by candle close or wick.",
            default: "WICK",
            options: ["CLOSE", "WICK"],
        },

        atrLength: {
            type: "integer",
            label: "ATR length",
            description: "Number of strategy candles used by the ATR calculation.",
            default: 14,
            min: 1,
        },

        candidateBreakoutAtr: {
            type: "number",
            label: "Candidate breakout ATR",
            description: "ATR multiple required to create a breakout candidate.",
            default: 0.5,
            min: 0.01,
        },

        strongBreakoutAtr: {
            type: "number",
            label: "Strong breakout ATR",
            description: "ATR multiple required for an immediate strong-breakout entry.",
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
