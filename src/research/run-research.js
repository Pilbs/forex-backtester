import {
    planBacktestExperiment,
    runBacktestExperiment,
} from "./backtest-experiment.js";

import {
    normalizeResearchConfig,
} from "./research-config.js";

import {
    getStrategyDefinition,
} from "../strategies/strategy-registry.js";

function createBacktestExperimentConfig(config) {
    const normalizedConfig = normalizeResearchConfig(config);
    const strategyDefinition = getStrategyDefinition(normalizedConfig.strategy);

    return {
        strategyDefinition,
        backtestConfig: normalizedConfig.market,
        accountConfig: normalizedConfig.account,
        executionPolicy: normalizedConfig.execution,
        baseStrategyConfig: normalizedConfig.strategyConfig,
        parameterGrid: normalizedConfig.parameterGrid,
        policy: normalizedConfig.policy,
    };
}

export function planResearch(config, {
    overrideLimits = false,
} = {}) {
    const experimentConfig = createBacktestExperimentConfig(config);

    return planBacktestExperiment({
        ...experimentConfig,
        overrideLimits,
    });
}

export async function runResearch(config, {
    overrideLimits = false,
    experimentId,
    includeTrades = false,
    includeRunDetails = false,
    captureEquityCurve = false,
    stopOnError = false,
    onProgress,
    abortSignal,
    datasetLoader,
    runWithDataset,
} = {}) {
    const experimentConfig = createBacktestExperimentConfig(config);

    return runBacktestExperiment({
        ...experimentConfig,
        overrideLimits,
        experimentId,
        includeTrades,
        includeRunDetails,
        captureEquityCurve,
        stopOnError,
        onProgress,
        abortSignal,
        datasetLoader,
        runWithDataset,
    });
}
