import {
    createEma,
    createRsi,
    crossover,
    crossunder,
} from "../../indicators/index.js";

function requirePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
}

function requireFiniteNumber(value, name) {
    if (!Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number`);
    }
}

function createRsiThresholdEvaluator(condition) {
    const {
        period = 14,
        operator,
        value,
    } = condition;

    requirePositiveInteger(period, "RSI period");
    requireFiniteNumber(value, "RSI threshold");

    if (!new Set(["BELOW", "ABOVE"]).has(operator)) {
        throw new Error("RSI_THRESHOLD operator must be BELOW or ABOVE");
    }

    const rsi = createRsi(period);

    return {
        reset() {
            rsi.reset();
        },

        next(context) {
            const close = context.candle.mid.close;
            const rsiValue = rsi.next(close);

            if (rsiValue === null) {
                return {
                    ready: false,
                    matched: false,
                };
            }

            return {
                ready: true,
                matched: operator === "BELOW"
                    ? rsiValue < value
                    : rsiValue > value,
                metadata: {
                    type: "RSI_THRESHOLD",
                    period,
                    operator,
                    threshold: value,
                    value: rsiValue,
                },
            };
        },
    };
}

function createEmaCrossEvaluator(condition) {
    const {
        fastPeriod,
        slowPeriod,
        direction,
    } = condition;

    requirePositiveInteger(fastPeriod, "EMA fastPeriod");
    requirePositiveInteger(slowPeriod, "EMA slowPeriod");

    if (fastPeriod >= slowPeriod) {
        throw new Error("EMA_CROSS fastPeriod must be less than slowPeriod");
    }

    if (!new Set(["ABOVE", "BELOW"]).has(direction)) {
        throw new Error("EMA_CROSS direction must be ABOVE or BELOW");
    }

    const fastEma = createEma(fastPeriod);
    const slowEma = createEma(slowPeriod);

    let previousFast = null;
    let previousSlow = null;

    return {
        reset() {
            fastEma.reset();
            slowEma.reset();
            previousFast = null;
            previousSlow = null;
        },

        next(context) {
            const close = context.candle.mid.close;
            const fast = fastEma.next(close);
            const slow = slowEma.next(close);

            if (fast === null || slow === null) {
                return {
                    ready: false,
                    matched: false,
                };
            }

            const matched = direction === "ABOVE"
                ? crossover(previousFast, fast, previousSlow, slow)
                : crossunder(previousFast, fast, previousSlow, slow);

            const result = {
                ready: previousFast !== null && previousSlow !== null,
                matched,
                metadata: {
                    type: "EMA_CROSS",
                    fastPeriod,
                    slowPeriod,
                    direction,
                    fast,
                    slow,
                },
            };

            previousFast = fast;
            previousSlow = slow;

            return result;
        },
    };
}

export function createConditionEvaluator(condition) {
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
        throw new Error("condition must be an object");
    }

    switch (condition.type) {
        case "RSI_THRESHOLD":
            return createRsiThresholdEvaluator(condition);
        case "EMA_CROSS":
            return createEmaCrossEvaluator(condition);
        default:
            throw new Error(`Unsupported generic condition type: ${condition.type}`);
    }
}

export function createConditionGroup(group) {
    if (!group || typeof group !== "object" || Array.isArray(group)) {
        throw new Error("condition group must be an object");
    }

    const logic = group.logic ?? "AND";

    if (!new Set(["AND", "OR"]).has(logic)) {
        throw new Error("condition group logic must be AND or OR");
    }

    if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
        throw new Error("condition group must contain at least one condition");
    }

    const evaluators = group.conditions.map(createConditionEvaluator);

    return {
        reset() {
            for (const evaluator of evaluators) {
                evaluator.reset();
            }
        },

        next(context) {
            const results = evaluators.map((evaluator) => evaluator.next(context));
            const ready = results.every((result) => result.ready);

            if (!ready) {
                return {
                    ready: false,
                    matched: false,
                    results,
                };
            }

            return {
                ready: true,
                matched: logic === "AND"
                    ? results.every((result) => result.matched)
                    : results.some((result) => result.matched),
                results,
            };
        },
    };
}
