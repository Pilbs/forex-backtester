function formatValue(value) {
    return value === null || value === undefined ? "-" : value;
}

function formatReasonCounts(reasonCounts) {
    const entries = Object.entries(reasonCounts ?? {});

    if (entries.length === 0) {
        return "-";
    }

    return entries
        .map(([reason, count]) => `${reason}:${count}`)
        .join(", ");
}

function getSortValue(run, sortBy, sortDirection) {
    const value = run.summary?.[sortBy];

    if (Number.isFinite(value)) {
        return value;
    }

    return sortDirection === "asc"
        ? Number.POSITIVE_INFINITY
        : Number.NEGATIVE_INFINITY;
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

export function printBacktestExperimentPlan(plan) {
    console.log("");
    console.log("Backtest experiment plan");

    console.table([{
        strategy: plan.strategy.name,
        instrument: plan.backtest.instrument,
        strategyTimeframe: plan.backtest.strategyTimeframe,
        executionTimeframe: plan.backtest.executionTimeframe,
        from: plan.backtest.from,
        to: plan.backtest.to,
        initialCapital: plan.account.initialCapital,
        currency: plan.account.currency,
        leverage: plan.account.leverage,
        positionMode: plan.account.positionMode,
        requestedRuns: plan.research.requestedCombinations,
        validRuns: plan.research.validCombinations,
        invalidRuns: plan.research.invalidCombinations.length,
        warningThreshold: plan.research.policy.warningRunCount,
        maximumRuns: plan.research.policy.maximumRunCount,
        allowed: plan.allowed,
    }]);

    if (plan.warning) {
        console.warn(`Warning: ${plan.warning}`);
    }

    if (plan.rejectionReason) {
        console.warn(`Rejected: ${plan.rejectionReason}`);
    }

    if (plan.research.invalidCombinations.length > 0) {
        console.log("");
        console.log("Invalid parameter combinations");
        console.table(plan.research.invalidCombinations);
    }
}

export function printParameterSweepResult(result, {
    sortBy = "returnPercent",
    sortDirection = "desc",
} = {}) {
    const completedRuns = result.runs.filter((run) => run.status === "COMPLETED");
    const parameterNames = Object.keys(result.experiment.parameterGrid);
    const multiplier = sortDirection === "asc" ? 1 : -1;

    const sortedRuns = [...completedRuns].sort((runA, runB) => {
        const valueA = getSortValue(runA, sortBy, sortDirection);
        const valueB = getSortValue(runB, sortBy, sortDirection);
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
            pnlAccount: formatValue(run.summary.netPnlAccount),
            returnPct: formatValue(run.summary.returnPercent),
            profitFactor: formatValue(run.summary.profitFactor),
            profitFactorAccount: formatValue(run.summary.profitFactorAccount),
            maxDrawdownPct: formatValue(run.summary.maxDrawdownPercent),
            expectancyPips: run.summary.expectancyPips,
            rejectedOrders: run.summary.rejectedOrderCount ?? 0,
            rejectionReasons: formatReasonCounts(run.rejectionReasons),
            riskEvents: run.summary.riskEventCount ?? 0,
            halted: run.summary.halted ?? false,
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

export function printBacktestExperimentResult(result, options = {}) {
    console.log("");
    console.log("Backtest experiment result");

    console.table([{
        experimentId: result.experiment.id,
        strategy: result.experiment.strategy.name,
        instrument: result.experiment.backtest.instrument,
        from: result.experiment.backtest.from,
        to: result.experiment.backtest.to,
        requestedRuns: result.experiment.requestedCombinations,
        completedRuns: result.totals.completedRuns,
        failedRuns: result.totals.failedRuns,
        datasetLoadMs: result.experiment.datasetLoadElapsedMs,
        elapsedMs: result.experiment.elapsedMs,
    }]);

    printParameterSweepResult(result, options);
}
