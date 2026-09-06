import { getTimeframeDurationMs } from "../market/timeframe.js";

function parseTime(value, name) {
    const time = Date.parse(value);

    if (!Number.isFinite(time)) {
        throw new Error(`${name} must be a valid date/time`);
    }

    return time;
}

function estimateRows(durationMs, timeframe) {
    return Math.max(0, Math.ceil(durationMs / getTimeframeDurationMs(timeframe)));
}

export function estimateResearchUsage(config, plan) {
    const fromMs = parseTime(config.market.from, "market.from");
    const toMs = parseTime(config.market.to, "market.to");
    const durationMs = toMs - fromMs;

    if (durationMs <= 0) {
        throw new Error("market.from must be before market.to");
    }

    const strategyRows = estimateRows(durationMs, config.market.strategyTimeframe);
    const executionRows = config.market.executionTimeframe === config.market.strategyTimeframe
        ? 0
        : estimateRows(durationMs, config.market.executionTimeframe);

    const estimatedDatasetRows = strategyRows + executionRows;
    const requestedRuns = plan.research.requestedCombinations;
    const validRuns = plan.research.validCombinations;

    return {
        dateRangeDays: Number((durationMs / 86_400_000).toFixed(2)),
        estimatedStrategyRows: strategyRows,
        estimatedExecutionRows: executionRows,
        estimatedDatasetRows,
        requestedRuns,
        validRuns,
        estimatedCandleEvaluations: estimatedDatasetRows * validRuns,
        note: "Planning estimate only. Actual D1 rows read and compute usage are measured at execution time.",
    };
}
