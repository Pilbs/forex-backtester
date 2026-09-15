import { createConditionGroup } from "./condition-evaluator.js";
import { normalizeGenericStrategySpecShape } from "./generic-strategy-spec.js";

function validatePosition(position, side) {
    if (!position?.entry) {
        throw new Error(side + " entry rules are required");
    }

    createConditionGroup(position.entry);

    if (position.exit) {
        createConditionGroup(position.exit);
    }
}

export function validateGenericStrategyDefinition(definition) {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        throw new Error("generic strategy definition must be an object");
    }

    const config = normalizeGenericStrategySpecShape(definition);
    const long = config.positions?.long;
    const short = config.positions?.short;

    if (!long && !short) {
        throw new Error("generic strategy must define long rules, short rules, or both");
    }

    if (long) validatePosition(long, "long");
    if (short) validatePosition(short, "short");

    return config;
}

function createPositionRuntime(position, side) {
    if (!position) return null;

    const entry = createConditionGroup(position.entry);
    const exit = position.exit ? createConditionGroup(position.exit) : null;

    return {
        side,
        entry,
        exit,
        risk: position.risk ?? {},
        reset() {
            entry.reset();
            exit?.reset();
        },
    };
}

export function createGenericStrategy({ definition } = {}) {
    const config = validateGenericStrategyDefinition(definition);
    const runtimes = [
        createPositionRuntime(config.positions.long, "LONG"),
        createPositionRuntime(config.positions.short, "SHORT"),
    ].filter(Boolean);

    function reset() {
        for (const runtime of runtimes) {
            runtime.reset();
        }
    }

    function onCandle(context) {
        const evaluations = runtimes.map((runtime) => ({
            runtime,
            entryResult: runtime.entry.next(context),
            exitResult: runtime.exit?.next(context) ?? null,
            matchingTradeOpen: context.openTrades.some(
                (trade) => trade.side === runtime.side
            ),
        }));

        const openEvaluation = evaluations.find(
            (evaluation) => evaluation.matchingTradeOpen
        );

        if (openEvaluation) {
            const { runtime, exitResult } = openEvaluation;

            if (!exitResult?.ready || !exitResult.matched) {
                return null;
            }

            return {
                action: "EXIT",
                target: {
                    type: "SIDE",
                    value: runtime.side,
                },
                reason: "GENERIC_EXIT_CONDITIONS",
                metadata: {
                    strategy: "GENERIC",
                    definitionName: config.name ?? null,
                    side: runtime.side,
                    conditions: exitResult.results.map((result) => result.metadata ?? null),
                },
            };
        }

        if (context.openTrades.length > 0) {
            return null;
        }

        const matchingEntries = evaluations.filter(
            ({ entryResult }) => entryResult.ready && entryResult.matched
        );

        if (matchingEntries.length !== 1) {
            return null;
        }

        const { runtime, entryResult } = matchingEntries[0];
        const signal = {
            action: "ENTER",
            side: runtime.side,
            metadata: {
                strategy: "GENERIC",
                definitionName: config.name ?? null,
                side: runtime.side,
                conditions: entryResult.results.map((result) => result.metadata ?? null),
            },
        };

        if (Number.isFinite(runtime.risk?.stopLossPips)) {
            signal.stopLoss = {
                type: "PIPS",
                value: runtime.risk.stopLossPips,
            };
        }

        if (Number.isFinite(runtime.risk?.takeProfitPips)) {
            signal.takeProfit = {
                type: "PIPS",
                value: runtime.risk.takeProfitPips,
            };
        }

        return signal;
    }

    return {
        name: config.name ?? "Generic Strategy",
        reset,
        onCandle,
    };
}
