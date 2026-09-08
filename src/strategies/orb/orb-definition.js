import { createOrbStrategy } from "./orb-strategy.js";

export const orbDefinition = {
    id: "orb",
    name: "Opening Range Breakout",
    version: 3,
    description: "TradingView-aligned ORB strategy with sweepable entry, filter, risk and timing controls.",

    createStrategy: createOrbStrategy,

    parameters: {
        orbStartHour: {
            type: "integer",
            label: "ORB start hour",
            description: "Opening-range start hour in the selected strategy time zone.",
            default: 8,
            min: 0,
            max: 23,
        },

        orbStartMinute: {
            type: "integer",
            label: "ORB start minute",
            description: "Opening-range start minute in the selected strategy time zone.",
            default: 15,
            min: 0,
            max: 59,
        },

        orbDurationMinutes: {
            type: "integer",
            label: "ORB duration minutes",
            description: "Number of minutes used to build the opening range. This is separate from strategy/execution timeframe.",
            default: 60,
            min: 1,
        },

        timezoneMode: {
            type: "string",
            label: "Timezone",
            description: "TradingView-aligned timezone selection. EXCHANGE resolves to Etc/UTC for the OANDA research dataset.",
            default: "EXCHANGE",
            options: ["EXCHANGE", "NEW_YORK", "LONDON", "UTC"],
        },

        breakoutCondition: {
            type: "string",
            label: "Breakout condition",
            description: "Price source used to detect and measure the ORB breakout.",
            default: "CLOSE",
            options: ["CLOSE", "WICK"],
        },

        requiredRetests: {
            type: "integer",
            label: "Required retests",
            description: "Number of confirmed ORB retests required before entry. Zero enters immediately on a valid breakout.",
            default: 1,
            min: 0,
            max: 10,
        },

        breakoutDistanceEntryEnabled: {
            type: "boolean",
            label: "Enable breakout distance entry",
            description: "Allow entry before the required retests when price reaches the configured distance beyond the ORB boundary.",
            default: false,
        },

        breakoutDistanceMode: {
            type: "string",
            label: "Breakout distance mode",
            description: "Unit used for the early-entry breakout distance.",
            default: "ATR",
            options: ["ATR", "PIPS", "UNITS", "RANGE_PERCENT"],
        },

        breakoutDistanceValue: {
            type: "number",
            label: "Breakout distance value",
            description: "Breakout distance threshold in the selected mode.",
            default: 1,
            min: 0,
        },

        maxOrbRangeEnabled: {
            type: "boolean",
            label: "Enable max ORB range",
            description: "Block entries when the completed ORB is larger than the configured maximum.",
            default: false,
        },

        maxOrbRangeMode: {
            type: "string",
            label: "Max ORB range mode",
            description: "Unit used for the maximum completed ORB size.",
            default: "PIPS",
            options: ["ATR", "PIPS", "UNITS"],
        },

        maxOrbRangeValue: {
            type: "number",
            label: "Max ORB range value",
            description: "Maximum completed ORB size in the selected mode.",
            default: 30,
            min: 0.00001,
        },

        atrLength: {
            type: "integer",
            label: "ATR length",
            description: "Number of strategy candles used by ATR calculations.",
            default: 12,
            min: 1,
        },

        stopLossMode: {
            type: "string",
            label: "Stop-loss mode",
            description: "Unit used for the initial protective stop distance.",
            default: "PERCENT",
            options: ["PERCENT", "ATR", "PIPS", "UNITS"],
        },

        stopLossValue: {
            type: "number",
            label: "Stop-loss value",
            description: "Initial protective stop distance in the selected mode.",
            default: 0.20,
            min: 0.00001,
        },

        takeProfitMode: {
            type: "string",
            label: "Take-profit mode",
            description: "Unit used for the initial take-profit distance.",
            default: "ATR",
            options: ["ATR", "PIPS", "UNITS"],
        },

        takeProfitValue: {
            type: "number",
            label: "Take-profit value",
            description: "Initial take-profit distance in the selected mode.",
            default: 3,
            min: 0.00001,
        },

        tpProgressEnabled: {
            type: "boolean",
            label: "Enable TP progress management",
            description: "At strategy-candle closes, move the stop and optionally extend the target using the original TP distance.",
            default: false,
        },

        tpProgressTriggerPct: {
            type: "number",
            label: "TP progress trigger %",
            description: "Trigger level as a percentage of the original take-profit distance.",
            default: 90,
            min: 0.1,
        },

        tpProgressStopPct: {
            type: "number",
            label: "Move SL to % of TP",
            description: "New stop level measured from entry as a percentage of the original take-profit distance.",
            default: 75,
            min: 0,
        },

        tpProgressExtendTarget: {
            type: "boolean",
            label: "Extend take profit",
            description: "Extend the take-profit target when TP progression triggers.",
            default: true,
        },

        tpProgressTargetPct: {
            type: "number",
            label: "Move TP to % of original TP",
            description: "Extended target measured from entry as a percentage of the original take-profit distance.",
            default: 125,
            min: 0.1,
        },

        tpProgressRepeat: {
            type: "boolean",
            label: "Repeat TP progression",
            description: "Repeat TP progression in percentage steps while price continues in favour.",
            default: true,
        },

        tpProgressStepPct: {
            type: "number",
            label: "TP progression step %",
            description: "Percentage-point step added to trigger/stop/target levels for each repeated stage.",
            default: 25,
            min: 0.1,
        },

        closeAtNextORB: {
            type: "boolean",
            label: "Close unfinished trade at next ORB",
            description: "Close an open trade when the next opening range begins.",
            default: true,
        },

        latestEntryEnabled: {
            type: "boolean",
            label: "Enable latest entry time",
            description: "Prevent new ORB entries at or after the configured local cutoff time.",
            default: true,
        },

        latestEntryHour: {
            type: "integer",
            label: "Latest entry hour",
            description: "Latest-entry cutoff hour in the selected strategy time zone.",
            default: 12,
            min: 0,
            max: 23,
        },

        latestEntryMinute: {
            type: "integer",
            label: "Latest entry minute",
            description: "Latest-entry cutoff minute in the selected strategy time zone.",
            default: 15,
            min: 0,
            max: 59,
        },

        skipFridayEntries: {
            type: "boolean",
            label: "Skip Friday entries",
            description: "Do not allow a new ORB trade on Fridays in the selected strategy time zone.",
            default: false,
        },

        profitExitWindowEnabled: {
            type: "boolean",
            label: "Enable profit exit window",
            description: "Close an open trade when it is profitable at a strategy-candle close inside the configured time window.",
            default: false,
        },

        profitExitStartHour: {
            type: "integer",
            label: "Profit exit start hour",
            description: "Profit-exit window start hour in the selected strategy time zone.",
            default: 17,
            min: 0,
            max: 23,
        },

        profitExitStartMinute: {
            type: "integer",
            label: "Profit exit start minute",
            description: "Profit-exit window start minute in the selected strategy time zone.",
            default: 0,
            min: 0,
            max: 59,
        },

        profitExitEndHour: {
            type: "integer",
            label: "Profit exit end hour",
            description: "Profit-exit window end hour in the selected strategy time zone.",
            default: 18,
            min: 0,
            max: 23,
        },

        profitExitEndMinute: {
            type: "integer",
            label: "Profit exit end minute",
            description: "Profit-exit window end minute in the selected strategy time zone.",
            default: 0,
            min: 0,
            max: 59,
        },
    },

    validateConfig(config) {
        const errors = [];
        const startMinutes = config.orbStartHour * 60 + config.orbStartMinute;

        if (startMinutes + config.orbDurationMinutes > 24 * 60) {
            errors.push("ORB duration cannot cross midnight");
        }

        if (config.tpProgressEnabled && config.tpProgressStopPct >= config.tpProgressTriggerPct) {
            errors.push("tpProgressStopPct must be lower than tpProgressTriggerPct");
        }

        if (
            config.tpProgressEnabled &&
            config.tpProgressExtendTarget &&
            config.tpProgressTargetPct <= config.tpProgressTriggerPct
        ) {
            errors.push("tpProgressTargetPct must be greater than tpProgressTriggerPct");
        }

        return errors;
    },
};
