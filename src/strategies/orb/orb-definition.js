import { createOrbStrategy } from "./orb-strategy.js";

export const orbDefinition = {
    id: "orb",
    name: "Opening Range Breakout",
    version: 1,
    createStrategy: createOrbStrategy,
    parameters: {
        startHour: {
            type: "integer",
            default: 8,
            min: 0,
            max: 23,
            label: "ORB start hour",
        },
        startMinute: {
            type: "integer",
            default: 15,
            min: 0,
            max: 59,
            label: "ORB start minute",
        },
        durationMinutes: {
            type: "integer",
            default: 60,
            min: 1,
            max: 1440,
            label: "ORB duration in minutes",
        },
        timeZone: {
            type: "string",
            default: "America/New_York",
            label: "ORB timezone",
        },
        stopLossPips: {
            type: "number",
            default: 10,
            min: 0.1,
            label: "Stop loss in pips",
        },
        takeProfitPips: {
            type: "number",
            default: 20,
            min: 0.1,
            label: "Take profit in pips",
        },
    },
    validateConfig(config) {
        const sessionStart = config.startHour * 60 + config.startMinute;
        const errors = [];

        if (sessionStart + config.durationMinutes > 24 * 60) {
            errors.push("ORB sessions crossing midnight are not supported");
        }

        return errors;
    },
};
