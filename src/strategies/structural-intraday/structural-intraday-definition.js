import { createStructuralIntradayStrategy } from "./structural-intraday-strategy.js";
import { M1_TRIGGER_TYPES } from "./m1-triggers.js";

export const structuralIntradayDefinition = {
    id: "structural-intraday",
    name: "Structural Intraday",
    version: 1,
    description: (
        "Research-derived H1 structural regimes with M1 entry triggers. "
        + "Requires M1 strategy timeframe; designed for controlled parameter sweeps."
    ),

    createStrategy: createStructuralIntradayStrategy,

    parameters: {
        // --- Direction switches ---
        longEnabled: {
            type: "boolean",
            label: "Enable long side",
            description: "Allow entries from the lower-H1-range long regime.",
            default: true,
        },

        shortEnabled: {
            type: "boolean",
            label: "Enable short side",
            description: "Allow entries from the H1 6-hour return short regime.",
            default: true,
        },

        // --- Shared H1 structure ---
        h1AtrLength: {
            type: "integer",
            label: "H1 ATR length",
            description: "Completed H1 bars used for the H1 ATR reference.",
            default: 14,
            min: 2,
        },

        // --- Long structural regime ---
        longH1RangeLookbackHours: {
            type: "integer",
            label: "Long regime: H1 range lookback",
            description: "Completed H1 bars used to define the rolling structural range.",
            default: 12,
            min: 2,
            enabledWhen: { parameter: "longEnabled", equals: true },
        },

        longRangePositionMin: {
            type: "number",
            label: "Long regime: minimum range position",
            description: "Lower bound for the completed-H1 close position inside the rolling H1 range.",
            default: 0.080119,
            min: 0,
            max: 1,
            enabledWhen: { parameter: "longEnabled", equals: true },
        },

        longRangePositionMax: {
            type: "number",
            label: "Long regime: maximum range position",
            description: "Upper bound for the completed-H1 close position inside the rolling H1 range.",
            default: 0.161440,
            min: 0,
            max: 1,
            enabledWhen: { parameter: "longEnabled", equals: true },
        },

        // --- Short structural regime ---
        shortH1ReturnLookbackHours: {
            type: "integer",
            label: "Short regime: H1 return lookback",
            description: "Completed H1 bars separating the current close from the return reference close.",
            default: 6,
            min: 1,
            enabledWhen: { parameter: "shortEnabled", equals: true },
        },

        shortReturnAtrMin: {
            type: "number",
            label: "Short regime: minimum H1 return / ATR",
            description: "Lower bound for the completed-H1 return normalized by H1 ATR.",
            default: -0.083102,
            enabledWhen: { parameter: "shortEnabled", equals: true },
        },

        shortReturnAtrMax: {
            type: "number",
            label: "Short regime: maximum H1 return / ATR",
            description: "Upper bound for the completed-H1 return normalized by H1 ATR.",
            default: 0.484133,
            enabledWhen: { parameter: "shortEnabled", equals: true },
        },

        // --- M1 trigger selection ---
        longTriggerType: {
            type: "string",
            label: "Long M1 trigger",
            description: "M1 event required while the long H1 regime is active.",
            default: "MOMENTUM_BURST_5M",
            options: [...M1_TRIGGER_TYPES],
            enabledWhen: { parameter: "longEnabled", equals: true },
        },

        shortTriggerType: {
            type: "string",
            label: "Short M1 trigger",
            description: "M1 event required while the short H1 regime is active.",
            default: "MOMENTUM_BURST_5M",
            options: [...M1_TRIGGER_TYPES],
            enabledWhen: { parameter: "shortEnabled", equals: true },
        },

        // The current research leader on both sides is MOMENTUM_BURST_5M.
        // These are exposed first; the other trigger families retain their
        // frozen discovery-stage definitions until they justify deeper tuning.
        momentumReturnLookback: {
            type: "integer",
            label: "Momentum: return lookback",
            description: "M1 bars used for the momentum price move when a momentum trigger is selected.",
            default: 5,
            min: 1,
        },

        momentumAtrLength: {
            type: "integer",
            label: "Momentum: ATR length",
            description: "M1 true-range observations used by the momentum threshold.",
            default: 14,
            min: 2,
        },

        momentumAtrMultiple: {
            type: "number",
            label: "Momentum: ATR multiple",
            description: "Required absolute M1 move as a multiple of current M1 ATR.",
            default: 1.25,
            min: 0.05,
        },

        momentumFastEma: {
            type: "integer",
            label: "Momentum: fast EMA",
            description: "Fast M1 EMA used as the momentum trend filter.",
            default: 30,
            min: 2,
        },

        momentumSlowEma: {
            type: "integer",
            label: "Momentum: slow EMA",
            description: "Slow M1 EMA used as the momentum trend filter.",
            default: 60,
            min: 3,
        },

        // --- Trade cadence and exits ---
        cooldownMinutes: {
            type: "integer",
            label: "Entry cooldown minutes",
            description: "Minimum time between strategy entry signals.",
            default: 15,
            min: 0,
        },

        maxHoldMinutes: {
            type: "integer",
            label: "Maximum hold minutes",
            description: "Time-based exit measured from the actual trade entry time.",
            default: 60,
            min: 1,
        },

        stopLossEnabled: {
            type: "boolean",
            label: "Enable stop loss",
            description: "Attach a fixed-pip protective stop to new entries.",
            default: false,
        },

        stopLossPips: {
            type: "number",
            label: "Stop loss pips",
            description: "Fixed protective stop distance.",
            default: 10,
            min: 0.1,
            enabledWhen: { parameter: "stopLossEnabled", equals: true },
        },

        takeProfitEnabled: {
            type: "boolean",
            label: "Enable take profit",
            description: "Attach a fixed-pip take-profit target to new entries.",
            default: false,
        },

        takeProfitPips: {
            type: "number",
            label: "Take profit pips",
            description: "Fixed take-profit distance.",
            default: 15,
            min: 0.1,
            enabledWhen: { parameter: "takeProfitEnabled", equals: true },
        },
    },

    validateConfig(config) {
        const errors = [];

        if (!config.longEnabled && !config.shortEnabled) {
            errors.push("At least one direction must be enabled");
        }

        if (
            config.longEnabled
            && config.longRangePositionMin >= config.longRangePositionMax
        ) {
            errors.push(
                "longRangePositionMin must be lower than longRangePositionMax"
            );
        }

        if (
            config.shortEnabled
            && config.shortReturnAtrMin >= config.shortReturnAtrMax
        ) {
            errors.push(
                "shortReturnAtrMin must be lower than shortReturnAtrMax"
            );
        }

        if (config.momentumFastEma >= config.momentumSlowEma) {
            errors.push("momentumFastEma must be lower than momentumSlowEma");
        }

        return errors;
    },
};
