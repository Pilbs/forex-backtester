const SAME_CANDLE_CONFLICTS = new Set([
    "STOP_FIRST",
    "TARGET_FIRST",
]);

const COMMISSION_TYPES = new Set([
    "NONE",
    "PIPS_PER_SIDE",
    "FIXED_PER_ORDER",
    "PERCENT_NOTIONAL",
]);

export function resolveExecutionPolicy(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("executionPolicy must be an object");
    }

    const policy = {
        sameCandleConflict: "STOP_FIRST",
        slippagePips: 0,

        commission: {
            type: "NONE",
            value: 0,
        },

        closeOpenTradesAtEnd: true,
        rejectOnInsufficientMargin: true,
        defaultTimeInForce: "GTC",

        ...input,

        commission: {
            type: "NONE",
            value: 0,
            ...(input.commission ?? {}),
        },
    };

    if (!SAME_CANDLE_CONFLICTS.has(policy.sameCandleConflict)) {
        throw new Error("sameCandleConflict must be STOP_FIRST or TARGET_FIRST");
    }

    if (!Number.isFinite(policy.slippagePips) || policy.slippagePips < 0) {
        throw new Error("slippagePips must be a non-negative number");
    }

    if (!COMMISSION_TYPES.has(policy.commission.type)) {
        throw new Error(
            "commission.type must be NONE, PIPS_PER_SIDE, FIXED_PER_ORDER or PERCENT_NOTIONAL"
        );
    }

    if (!Number.isFinite(policy.commission.value) || policy.commission.value < 0) {
        throw new Error("commission.value must be a non-negative number");
    }

    if (typeof policy.closeOpenTradesAtEnd !== "boolean") {
        throw new Error("closeOpenTradesAtEnd must be boolean");
    }

    if (typeof policy.rejectOnInsufficientMargin !== "boolean") {
        throw new Error("rejectOnInsufficientMargin must be boolean");
    }

    if (!new Set(["GTC", "DAY", "IOC", "FOK"]).has(policy.defaultTimeInForce)) {
        throw new Error("defaultTimeInForce must be GTC, DAY, IOC or FOK");
    }

    return policy;
}