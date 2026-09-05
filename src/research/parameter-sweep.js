import {
    summarizeTradesByMonth,
    summarizeTradesByYear,
} from "../backtest/backtest-summary.js";

import {
    createStrategyFromDefinition,
} from "../strategies/strategy-definition.js";

import {
    planParameterSweep,
} from "./experiment-planner.js";

function createId(prefix) {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function serializeError(error) {
    return {
        name: error?.name ?? "Error",
        message: error?.message ?? String(error),
    };
}

function createDetailCounts(backtestResult) {
    return {
        signals: backtestResult.signals?.length ?? 0,
        orders: backtestResult.orders?.length ?? 0,
        fills: backtestResult.fills?.length ?? 0,
        rejectedOrders: backtestResult.rejectedOrders?.length ?? 0,
        riskEvents: backtestResult.riskEvents?.length ?? 0,
        openTradesAtEnd: backtestResult.openTrades?.length ?? 0,
        pendingOrdersAtEnd: backtestResult.pendingOrders?.length ?? 0,
    };
}

function createReasonCounts(items, propertyName) {
    const counts = {};

    for (const item of items ?? []) {
        const reason = item?.[propertyName] ?? "UNKNOWN";
        counts[reason] = (counts[reason] ?? 0) + 1;
    }

    return counts;
}

export async function runParameterSweep({
    strategyDefinition,
    baseStrategyConfig = {},
    parameterGrid = {},
    policy = {},
    overrideLimits = false,
    executeRun,
    includeTrades = false,
    includeRunDetails = false,
    stopOnError = false,
    experimentId = createId("experiment"),
    onProgress,
    abortSignal,
}) {
    if (typeof executeRun !== "function") {
        throw new Error("executeRun must be a function");
    }

    if (onProgress !== undefined && typeof onProgress !== "function") {
        throw new Error("onProgress must be a function");
    }

    const plan = planParameterSweep({
        strategyDefinition,
        baseStrategyConfig,
        parameterGrid,
        policy,
        overrideLimits,
    });

    if (!plan.allowed) {
        throw new Error(plan.rejectionReason);
    }

    const startedAt = new Date().toISOString();
    const runs = [];

    for (const configuration of plan.configurations) {
        if (abortSignal?.aborted) {
            throw new Error("Parameter sweep was cancelled");
        }

        const runStarted = performance.now();
        const runId = createId("run");

        try {
            const { strategy, strategyConfig } = createStrategyFromDefinition({
                strategyDefinition,
                strategyConfig: configuration.strategyConfig,
            });

            const backtestResult = await executeRun({
                runId,
                strategy,
                strategyConfig,
                parameterValues: configuration.parameterValues,
            });

            const trades = backtestResult.trades ?? [];

            const run = {
                runId,
                runNumber: configuration.runNumber,
                status: "COMPLETED",
                parameterValues: configuration.parameterValues,
                strategyConfig,

                summary: backtestResult.summary,
                yearlySummary: summarizeTradesByYear(trades),
                monthlySummary: summarizeTradesByMonth(trades),

                detailCounts: createDetailCounts(backtestResult),
                rejectionReasons: createReasonCounts(
                    backtestResult.rejectedOrders,
                    "reason"
                ),
                dataset: backtestResult.data ?? null,
                backtestConfig: backtestResult.config ?? null,

                elapsedMs: Math.round(performance.now() - runStarted),
            };

            if (includeTrades) {
                run.trades = trades;
            }

            if (includeRunDetails) {
                run.account = backtestResult.account ?? null;
                run.signals = backtestResult.signals ?? [];
                run.orders = backtestResult.orders ?? [];
                run.fills = backtestResult.fills ?? [];
                run.rejectedOrders = backtestResult.rejectedOrders ?? [];
                run.openTrades = backtestResult.openTrades ?? [];
                run.pendingOrders = backtestResult.pendingOrders ?? [];
                run.riskEvents = backtestResult.riskEvents ?? [];
                run.equityCurve = backtestResult.equityCurve ?? [];
            }

            runs.push(run);
        } catch (error) {
            if (stopOnError) {
                throw error;
            }

            runs.push({
                runId,
                runNumber: configuration.runNumber,
                status: "FAILED",
                parameterValues: configuration.parameterValues,
                strategyConfig: configuration.strategyConfig,
                error: serializeError(error),
                elapsedMs: Math.round(performance.now() - runStarted),
            });
        }

        if (onProgress) {
            await onProgress({
                experimentId,
                completedRuns: runs.length,
                totalRuns: plan.validCombinations,
                currentRun: runs[runs.length - 1],
            });
        }
    }

    const completedAt = new Date().toISOString();

    return {
        schemaVersion: 2,

        experiment: {
            id: experimentId,
            type: "PARAMETER_SWEEP",
            strategy: plan.strategy,
            startedAt,
            completedAt,
            elapsedMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),

            baseStrategyConfig: plan.baseStrategyConfig,
            parameterGrid: plan.parameterGrid,

            requestedCombinations: plan.requestedCombinations,
            validCombinations: plan.validCombinations,
            invalidCombinations: plan.invalidCombinations,

            policy: plan.policy,
            overrideLimits: plan.overrideLimits,
            warning: plan.warning,
        },

        totals: {
            completedRuns: runs.filter((run) => run.status === "COMPLETED").length,
            failedRuns: runs.filter((run) => run.status === "FAILED").length,
        },

        runs,
    };
}
