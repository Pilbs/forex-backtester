import {
    resolveAccountConfig,
    resolveQuoteToAccountRate,
} from "../account/account-config.js";

import {
    loadBacktestDataset,
    runBacktestWithDataset,
} from "../backtest/backtest-service.js";

import {
    resolveExecutionPolicy,
} from "../backtest/execution-policy.js";

import {
    getInstrumentMetadata,
} from "../market/instrument-metadata.js";

import {
    getTimeframeDurationMs,
} from "../market/timeframe.js";

import {
    planParameterSweep,
} from "./experiment-planner.js";

import {
    runParameterSweep,
} from "./parameter-sweep.js";

function toEpochMs(value, name) {
    if (value instanceof Date) {
        const time = value.getTime();

        if (!Number.isFinite(time)) {
            throw new Error(`Invalid ${name}`);
        }

        return time;
    }

    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error(`Invalid ${name}`);
        }

        return value;
    }

    const time = Date.parse(value);

    if (!Number.isFinite(time)) {
        throw new Error(`Invalid ${name}: ${value}`);
    }

    return time;
}

function resolveBacktestConfig(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("backtestConfig must be an object");
    }

    const {
        instrument,
        strategyTimeframe,
        executionTimeframe = strategyTimeframe,
        from,
        to,
    } = input;

    if (!instrument) {
        throw new Error("backtestConfig.instrument is required");
    }

    if (!strategyTimeframe) {
        throw new Error("backtestConfig.strategyTimeframe is required");
    }

    if (!executionTimeframe) {
        throw new Error("backtestConfig.executionTimeframe is required");
    }

    getTimeframeDurationMs(strategyTimeframe);
    getTimeframeDurationMs(executionTimeframe);

    const fromMs = toEpochMs(from, "backtestConfig.from");
    const toMs = toEpochMs(to, "backtestConfig.to");

    if (fromMs >= toMs) {
        throw new Error("backtestConfig.from must be before backtestConfig.to");
    }

    return {
        instrument,
        strategyTimeframe,
        executionTimeframe,
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString(),
    };
}

export function planBacktestExperiment({
    strategyDefinition,
    baseStrategyConfig = {},
    parameterGrid = {},
    backtestConfig,
    accountConfig = {},
    executionPolicy = {},
    policy = {},
    overrideLimits = false,
}) {
    const backtest = resolveBacktestConfig(backtestConfig);
    const instrumentMetadata = getInstrumentMetadata(backtest.instrument);

    const resolvedAccount = resolveAccountConfig(accountConfig, {
        defaultCurrency: instrumentMetadata.quoteCurrency,
    });

    const quoteToAccountRate = resolveQuoteToAccountRate({
        accountConfig: resolvedAccount,
        instrumentMetadata,
    });

    const account = {
        ...resolvedAccount,
        quoteToAccountRate,
    };

    const execution = resolveExecutionPolicy(executionPolicy);

    const parameterPlan = planParameterSweep({
        strategyDefinition,
        baseStrategyConfig,
        parameterGrid,
        policy,
        overrideLimits,
    });

    return {
        schemaVersion: 1,
        type: "BACKTEST_PARAMETER_SWEEP",

        strategy: parameterPlan.strategy,
        backtest,
        account,
        execution,

        baseStrategyConfig: parameterPlan.baseStrategyConfig,
        parameterGrid: parameterPlan.parameterGrid,

        research: {
            policy: parameterPlan.policy,
            overrideLimits: parameterPlan.overrideLimits,
            requestedCombinations: parameterPlan.requestedCombinations,
            validCombinations: parameterPlan.validCombinations,
            invalidCombinations: parameterPlan.invalidCombinations,
            warning: parameterPlan.warning,
        },

        configurations: parameterPlan.configurations,

        allowed: parameterPlan.allowed,
        warning: parameterPlan.warning,
        rejectionReason: parameterPlan.rejectionReason,
    };
}

export async function runBacktestExperiment({
    strategyDefinition,
    baseStrategyConfig = {},
    parameterGrid = {},
    backtestConfig,
    accountConfig = {},
    executionPolicy = {},
    policy = {},
    overrideLimits = false,

    experimentId,

    includeTrades = false,
    includeRunDetails = false,
    captureEquityCurve = false,
    stopOnError = false,

    onProgress,
    abortSignal,

    datasetLoader = loadBacktestDataset,
    runWithDataset = runBacktestWithDataset,
}) {
    if (typeof datasetLoader !== "function") {
        throw new Error("datasetLoader must be a function");
    }

    if (typeof runWithDataset !== "function") {
        throw new Error("runWithDataset must be a function");
    }

    if (
        experimentId !== undefined &&
        (typeof experimentId !== "string" || !experimentId.trim())
    ) {
        throw new Error("experimentId must be a non-empty string");
    }

    const plan = planBacktestExperiment({
        strategyDefinition,
        baseStrategyConfig,
        parameterGrid,
        backtestConfig,
        accountConfig,
        executionPolicy,
        policy,
        overrideLimits,
    });

    if (!plan.allowed) {
        throw new Error(plan.rejectionReason);
    }

    if (abortSignal?.aborted) {
        throw new Error("Backtest experiment was cancelled");
    }

    const datasetLoadStarted = performance.now();
    const dataset = await datasetLoader(plan.backtest);
    const datasetLoadElapsedMs = Math.round(performance.now() - datasetLoadStarted);

    if (!dataset || typeof dataset !== "object") {
        throw new Error("datasetLoader must return a dataset object");
    }

    const sweepResult = await runParameterSweep({
        strategyDefinition,
        baseStrategyConfig: plan.baseStrategyConfig,
        parameterGrid: plan.parameterGrid,
        policy: plan.research.policy,
        overrideLimits: plan.research.overrideLimits,
        experimentId,
        includeTrades,
        includeRunDetails,
        stopOnError,
        onProgress,
        abortSignal,

        executeRun: async ({ strategy }) => runWithDataset({
            dataset,
            strategy,
            accountConfig: plan.account,
            executionPolicy: plan.execution,
            captureEquityCurve,
        }),
    });

    return {
        ...sweepResult,
        schemaVersion: 4,

        experiment: {
            ...sweepResult.experiment,
            type: "BACKTEST_PARAMETER_SWEEP",

            backtest: plan.backtest,
            accountConfig: plan.account,
            executionPolicy: plan.execution,

            dataset: dataset.data ?? null,
            datasetLoadElapsedMs,

            captureEquityCurve,
            includeTrades,
            includeRunDetails,
        },
    };
}
