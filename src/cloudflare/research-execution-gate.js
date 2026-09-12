export const COMMISSIONING_LIMITS = Object.freeze({
    strategies: Object.freeze(["simple-sma", "orb"]),
    instrument: "EUR_USD",
    strategyTimeframe: "M5",
    executionTimeframe: "M5",
    maximumDateRangeDays: 1000,
    maximumRuns: 20,
    maximumDatasetRows: 500000,
    maximumCandleEvaluations: 1000000,
});

export function assessResearchExecution(config, plan, usageEstimate) {
    const reasons = [];
    const market = config?.market ?? {};

    if (!plan?.allowed) {
        reasons.push(plan?.rejectionReason ?? "Research plan is not allowed");
    }

    if (!COMMISSIONING_LIMITS.strategies.includes(config?.strategy)) {
        reasons.push(
            `Strategy must be one of: ${COMMISSIONING_LIMITS.strategies.join(", ")}`
        );
    }

    if (market.instrument !== COMMISSIONING_LIMITS.instrument) {
        reasons.push(`Only instrument ${COMMISSIONING_LIMITS.instrument} is enabled for cloud commissioning`);
    }

    if (market.strategyTimeframe !== COMMISSIONING_LIMITS.strategyTimeframe) {
        reasons.push(`Strategy timeframe must be ${COMMISSIONING_LIMITS.strategyTimeframe}`);
    }

    if (market.executionTimeframe !== COMMISSIONING_LIMITS.executionTimeframe) {
        reasons.push(`Execution timeframe must be ${COMMISSIONING_LIMITS.executionTimeframe}`);
    }

    if (usageEstimate?.dateRangeDays > COMMISSIONING_LIMITS.maximumDateRangeDays) {
        reasons.push(`Date range cannot exceed ${COMMISSIONING_LIMITS.maximumDateRangeDays} days`);
    }

    if (plan?.research?.requestedCombinations > COMMISSIONING_LIMITS.maximumRuns) {
        reasons.push(`Requested runs cannot exceed ${COMMISSIONING_LIMITS.maximumRuns}`);
    }

    if (plan?.research?.validCombinations > COMMISSIONING_LIMITS.maximumRuns) {
        reasons.push(`Valid runs cannot exceed ${COMMISSIONING_LIMITS.maximumRuns}`);
    }

    if (usageEstimate?.estimatedDatasetRows > COMMISSIONING_LIMITS.maximumDatasetRows) {
        reasons.push(`Estimated dataset rows cannot exceed ${COMMISSIONING_LIMITS.maximumDatasetRows}`);
    }

    if (usageEstimate?.estimatedCandleEvaluations > COMMISSIONING_LIMITS.maximumCandleEvaluations) {
        reasons.push(
            `Estimated candle evaluations cannot exceed ${COMMISSIONING_LIMITS.maximumCandleEvaluations}`
        );
    }

    return {
        mode: "COMMISSIONING",
        allowed: reasons.length === 0,
        reasons,
        limits: {
            ...COMMISSIONING_LIMITS,
            strategies: [...COMMISSIONING_LIMITS.strategies],
        },
    };
}
