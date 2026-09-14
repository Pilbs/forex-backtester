import { createConditionGroup } from "./condition-evaluator.js";

export function validateGenericStrategyDefinition(definition) {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        throw new Error("generic strategy definition must be an object");
    }

    if (definition.version !== 1) {
        throw new Error("generic strategy definition version must be 1");
    }

    if (!definition.entry) {
        throw new Error("generic strategy definition entry is required");
    }

    const side = definition.side ?? "LONG";

    if (!new Set(["LONG", "SHORT"]).has(side)) {
        throw new Error("generic strategy side must be LONG or SHORT");
    }

    // Build the condition groups once during validation so unsupported or
    // malformed conditions fail before an experiment is planned.
    createConditionGroup(definition.entry);
    if (definition.exit) {
        createConditionGroup(definition.exit);
    }

    return {
        ...definition,
        side,
    };
}

export function createGenericStrategy({ definition } = {}) {
    const config = validateGenericStrategyDefinition(definition);
    const entry = createConditionGroup(config.entry);
    const exit = config.exit ? createConditionGroup(config.exit) : null;

    function reset() {
        entry.reset();
        exit?.reset();
    }

    function onCandle(context) {
        const matchingTradeOpen = context.openTrades.some(
            (trade) => trade.side === config.side
        );

        // Stateful indicators must advance on every strategy candle, even when
        // their signal is not currently actionable.
        const entryResult = entry.next(context);
        const exitResult = exit?.next(context) ?? null;

        if (matchingTradeOpen) {
            if (!exitResult?.ready || !exitResult.matched) {
                return null;
            }

            return {
                action: "EXIT",
                target: {
                    type: "SIDE",
                    value: config.side,
                },
                reason: "GENERIC_EXIT_CONDITIONS",
                metadata: {
                    strategy: "GENERIC",
                    definitionName: config.name ?? null,
                    conditions: exitResult.results.map((result) => result.metadata ?? null),
                },
            };
        }

        if (context.openTrades.length > 0 || !entryResult.ready || !entryResult.matched) {
            return null;
        }

        return {
            action: "ENTER",
            side: config.side,
            metadata: {
                strategy: "GENERIC",
                definitionName: config.name ?? null,
                conditions: entryResult.results.map((result) => result.metadata ?? null),
            },
        };
    }

    return {
        name: config.name ?? "Generic Strategy",
        reset,
        onCandle,
    };
}
