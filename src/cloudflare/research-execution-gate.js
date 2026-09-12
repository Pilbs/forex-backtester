const SHARED_LIMITS = Object.freeze({
    strategies: Object.freeze(["simple-sma", "orb"]),
    instrument: "EUR_USD",
    strategyTimeframe: "M5",
    executionTimeframe: "M5",
});

export const ACCOUNT_USAGE_LIMITS = Object.freeze({
    OWNER: Object.freeze({
        ...SHARED_LIMITS,
        maximumDateRangeDays: 365,
        maximumRuns: 20,
        maximumDatasetRows: 100000,
        maximumCandleEvaluations: 400000,
    }),
    MEMBER: Object.freeze({
        ...SHARED_LIMITS,
        maximumDateRangeDays: 30,
        maximumRuns: 4,
        maximumDatasetRows: 10000,
        maximumCandleEvaluations: 40000,
    }),
});

// Retained for callers/tests that still refer to the original commissioning
// envelope. OWNER is the existing pre-account-role behavior.
export const COMMISSIONING_LIMITS = ACCOUNT_USAGE_LIMITS.OWNER;

export function getAccountUsageLimits(accountRole = "MEMBER") {
    return ACCOUNT_USAGE_LIMITS[accountRole] ?? ACCOUNT_USAGE_LIMITS.MEMBER;
}

export function assessResearchExecution(
    config,
    plan,
    usageEstimate,
    accountRole = "OWNER"
) {
    const reasons = [];
    const market = config?.market ?? {};
    const normalizedAccountRole = Object.hasOwn(ACCOUNT_USAGE_LIMITS, accountRole)
        ? accountRole
        : "MEMBER";
    const limits = getAccountUsageLimits(normalizedAccountRole);

    if (!plan?.allowed) {
        reasons.push(plan?.rejectionReason ?? "Research plan is not allowed");
    }

    if (!limits.strategies.includes(config?.strategy)) {
        reasons.push(
            `Strategy must be one of: ${limits.strategies.join(", ")}`
        );
    }

    if (market.instrument !== limits.instrument) {
        reasons.push(`Only instrument ${limits.instrument} is enabled for cloud commissioning`);
    }

    if (market.strategyTimeframe !== limits.strategyTimeframe) {
        reasons.push(`Strategy timeframe must be ${limits.strategyTimeframe}`);
    }

    if (market.executionTimeframe !== limits.executionTimeframe) {
        reasons.push(`Execution timeframe must be ${limits.executionTimeframe}`);
    }

    if (usageEstimate?.dateRangeDays > limits.maximumDateRangeDays) {
        reasons.push(`Date range cannot exceed ${limits.maximumDateRangeDays} days`);
    }

    if (plan?.research?.requestedCombinations > limits.maximumRuns) {
        reasons.push(`Requested runs cannot exceed ${limits.maximumRuns}`);
    }

    if (plan?.research?.validCombinations > limits.maximumRuns) {
        reasons.push(`Valid runs cannot exceed ${limits.maximumRuns}`);
    }

    if (usageEstimate?.estimatedDatasetRows > limits.maximumDatasetRows) {
        reasons.push(`Estimated dataset rows cannot exceed ${limits.maximumDatasetRows}`);
    }

    if (usageEstimate?.estimatedCandleEvaluations > limits.maximumCandleEvaluations) {
        reasons.push(
            `Estimated candle evaluations cannot exceed ${limits.maximumCandleEvaluations}`
        );
    }

    return {
        mode: "COMMISSIONING",
        accountRole: normalizedAccountRole,
        allowed: reasons.length === 0,
        reasons,
        limits: {
            ...limits,
            strategies: [...limits.strategies],
        },
    };
}
