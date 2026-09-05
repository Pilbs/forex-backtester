function formatValue(value) {
    return value === null || value === undefined ? "-" : value;
}

export function printParameterSweepPlan(plan) {
    console.log("");
    console.log("Experiment plan");
    console.table([{
        strategy: plan.strategy.name,
        requestedRuns: plan.requestedCombinations,
        validRuns: plan.validCombinations,
        invalidRuns: plan.invalidCombinations.length,
        warningThreshold: plan.policy.warningRunCount,
        maximumRuns: plan.policy.maximumRunCount,
        overrideLimits: plan.overrideLimits,
        allowed: plan.allowed,
    }]);

    if (plan.warning) {
        console.warn(`Warning: ${plan.warning}`);
    }

    if (plan.rejectionReason) {
        console.warn(`Rejected: ${plan.rejectionReason}`);
    }

    if (plan.invalidCombinations.length > 0) {
        console.log("");
        console.log("Invalid parameter combinations");
        console.table(plan.invalidCombinations);
    }
}

export function printParameterSweepResult(result, {
    sortBy = "totalPnlPips",
    sortDirection = "desc",
} = {}) {
    const completedRuns = result.runs.filter((run) => run.status === "COMPLETED");
    const parameterNames = Object.keys(result.experiment.parameterGrid);
    const multiplier = sortDirection === "asc" ? 1 : -1;

    const sortedRuns = [...completedRuns].sort((runA, runB) => {
        const valueA = runA.summary?.[sortBy] ?? Number.NEGATIVE_INFINITY;
        const valueB = runB.summary?.[sortBy] ?? Number.NEGATIVE_INFINITY;
        return (valueA - valueB) * multiplier;
    });

    console.log("");
    console.log("Parameter sweep results");
    console.table(sortedRuns.map((run) => {
        const row = {
            run: run.runNumber,
        };

        for (const parameterName of parameterNames) {
            row[parameterName] = run.strategyConfig[parameterName];
        }

        return {
            ...row,
            trades: run.summary.totalTrades,
            winRate: run.summary.winRate,
            pnlPips: run.summary.totalPnlPips,
            profitFactor: formatValue(run.summary.profitFactor),
            maxDrawdownPips: run.summary.maxDrawdownPips,
            expectancyPips: run.summary.expectancyPips,
            elapsedMs: run.elapsedMs,
        };
    }));

    const failedRuns = result.runs.filter((run) => run.status === "FAILED");
    if (failedRuns.length > 0) {
        console.log("");
        console.log("Failed runs");
        console.table(failedRuns.map((run) => ({
            run: run.runNumber,
            parameters: JSON.stringify(run.parameterValues),
            error: run.error.message,
        })));
    }
}
