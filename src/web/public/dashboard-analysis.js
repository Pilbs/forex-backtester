function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function hasMinimum(value, minimum) {
    return minimum === null || minimum === undefined || minimum === ""
        || (isFiniteNumber(value) && value >= Number(minimum));
}

function hasMaximum(value, maximum) {
    return maximum === null || maximum === undefined || maximum === ""
        || (isFiniteNumber(value) && value <= Number(maximum));
}

function conditionsFor(parameter) {
    if (parameter?.enabledWhen === undefined) {
        return [];
    }

    return Array.isArray(parameter.enabledWhen)
        ? parameter.enabledWhen
        : [parameter.enabledWhen];
}

export function isStrategyParameterEnabled(
    strategy,
    parameterId,
    baseValues = {},
    sweepValues = {}
) {
    const parameters = new Map(
        (strategy?.parameters ?? []).map((parameter) => [parameter.id, parameter])
    );
    const resolving = new Set();

    function isEnabled(id) {
        if (resolving.has(id)) {
            return false;
        }

        const parameter = parameters.get(id);

        if (!parameter) {
            return false;
        }

        resolving.add(id);
        const enabled = conditionsFor(parameter).every((condition) => {
            if (!isEnabled(condition.parameter)) {
                return false;
            }

            const swept = sweepValues[condition.parameter];
            const candidates = Array.isArray(swept) && swept.length > 0
                ? swept
                : [baseValues[condition.parameter]];

            return candidates.some((value) => Object.is(value, condition.equals));
        });
        resolving.delete(id);
        return enabled;
    }

    return isEnabled(parameterId);
}

export function createFollowUpName(name, fallback = "Experiment") {
    let base = String(name ?? "").trim() || fallback;
    let lastNumber = 0;
    const suffix = /^(.*?)\s*(?:[-–—]\s*)?follow-up(?:\s+(\d+))?\s*$/i;

    while (true) {
        const match = base.match(suffix);

        if (!match || !match[1].trim()) {
            break;
        }

        lastNumber = Math.max(lastNumber, match[2] ? Number(match[2]) : lastNumber + 1);
        base = match[1].trim();
    }

    return `${base} – follow-up ${lastNumber + 1}`;
}

export function filterRuns(runs, filters = {}) {
    const search = String(filters.parameterSearch ?? "").trim().toLowerCase();

    return runs.filter((run) => {
        if (filters.status && filters.status !== "ALL" && run.status !== filters.status) {
            return false;
        }

        const summary = run.summary ?? {};

        if (!hasMinimum(summary.totalTrades, filters.minimumTrades)) {
            return false;
        }

        if (!hasMinimum(summary.returnPercent, filters.minimumReturnPercent)) {
            return false;
        }

        if (!hasMaximum(summary.maxDrawdownPercent, filters.maximumDrawdownPercent)) {
            return false;
        }

        if (!hasMinimum(summary.profitFactor, filters.minimumProfitFactor)) {
            return false;
        }

        if (search) {
            const parameterText = JSON.stringify({
                ...run.strategyConfig,
                ...run.parameterValues,
            }).toLowerCase();

            if (!parameterText.includes(search)) {
                return false;
            }
        }

        return true;
    });
}

function humanize(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/^./, (letter) => letter.toUpperCase());
}

const PREFERRED_SUMMARY_METRICS = [
    "totalTrades",
    "wins",
    "losses",
    "breakeven",
    "winRate",
    "totalPnlPips",
    "netPnlAccount",
    "returnPercent",
    "profitFactor",
    "maxDrawdownPips",
    "maxDrawdownAccount",
    "maxDrawdownPercent",
    "expectancyPips",
    "expectancyAccount",
    "averageHoldingMinutes",
    "averageMfePips",
    "averageMaePips",
    "largestWinPips",
    "largestLossPips",
    "totalCommissionAccount",
];

export function createRunComparison(runs) {
    const parameterNames = new Set();
    const summaryNames = new Set();

    for (const run of runs) {
        Object.keys(run.strategyConfig ?? {}).forEach((name) => parameterNames.add(name));
        Object.keys(run.summary ?? {}).forEach((name) => summaryNames.add(name));
    }

    const orderedSummaryNames = [
        ...PREFERRED_SUMMARY_METRICS.filter((name) => summaryNames.has(name)),
        ...[...summaryNames]
            .filter((name) => !PREFERRED_SUMMARY_METRICS.includes(name))
            .sort(),
    ];

    return [
        {
            key: "status",
            label: "Status",
            values: runs.map((run) => run.status),
        },
        ...[...parameterNames].sort().map((name) => ({
            key: `parameter.${name}`,
            label: `Parameter · ${humanize(name)}`,
            values: runs.map((run) => run.strategyConfig?.[name]),
        })),
        ...orderedSummaryNames.map((name) => ({
            key: `summary.${name}`,
            label: humanize(name),
            values: runs.map((run) => run.summary?.[name]),
        })),
    ];
}

function csvValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    let text = typeof value === "object" ? JSON.stringify(value) : String(value);

    if (typeof value === "string" && /^[=+\-@]/.test(text)) {
        text = `'${text}`;
    }

    if (/[",\r\n]/.test(text)) {
        return `"${text.replaceAll('"', '""')}"`;
    }

    return text;
}

function collectNames(runs, selector) {
    const names = new Set();

    for (const run of runs) {
        Object.keys(selector(run) ?? {}).forEach((name) => names.add(name));
    }

    return [...names].sort();
}

export function createHistoricalRunsCsv(detail) {
    const experiment = detail.experiment ?? {};
    const market = experiment.market ?? {};
    const runs = detail.runs ?? [];
    const parameterNames = collectNames(runs, (run) => run.strategyConfig);
    const summaryNames = collectNames(runs, (run) => run.summary);

    const headings = [
        "experimentId",
        "experimentStatus",
        "experimentPurpose",
        "applicationVersion",
        "strategyId",
        "strategyName",
        "instrument",
        "strategyTimeframe",
        "executionTimeframe",
        "from",
        "to",
        "accountConfig",
        "executionPolicy",
        "runId",
        "runNumber",
        "runStatus",
        "parameterValues",
        ...parameterNames.map((name) => `strategyConfig.${name}`),
        ...summaryNames.map((name) => `summary.${name}`),
        "detailCounts",
        "rejectionReasons",
        "periodSummaries",
        "elapsedMs",
        "error",
    ];

    const rows = runs.map((run) => [
        experiment.id,
        experiment.status,
        experiment.purpose,
        experiment.applicationVersion,
        experiment.strategy?.id,
        experiment.strategy?.name,
        market.instrument,
        market.strategyTimeframe,
        market.executionTimeframe,
        market.from,
        market.to,
        experiment.config?.account,
        experiment.config?.execution,
        run.id,
        run.runNumber,
        run.status,
        run.parameterValues,
        ...parameterNames.map((name) => run.strategyConfig?.[name]),
        ...summaryNames.map((name) => run.summary?.[name]),
        run.detailCounts,
        run.rejectionReasons,
        run.periods,
        run.elapsedMs,
        run.error,
    ]);

    return [headings, ...rows]
        .map((row) => row.map(csvValue).join(","))
        .join("\r\n");
}

export function createHistoricalJson(detail) {
    return JSON.stringify(detail, null, 2);
}

export function createHistoricalExportBaseName(experiment = {}) {
    const safe = (value, fallback) => String(value ?? fallback)
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || fallback;
    const date = (value) => {
        const time = Date.parse(value);
        return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : "date";
    };

    return [
        safe(experiment.strategy?.id, "strategy"),
        safe(experiment.market?.instrument, "instrument"),
        safe(experiment.market?.strategyTimeframe, "tf"),
        date(experiment.market?.from),
        date(experiment.market?.to),
        `${experiment.completedRuns ?? 0}-runs`,
    ].join("_");
}

export function calculatePeriodInsights(periods = []) {
    const metricKey = periods.some((period) =>
        isFiniteNumber(period.summary?.totalPnlAccount)
    ) ? "totalPnlAccount" : "totalPnlPips";
    const metricValue = (period) => period.summary?.[metricKey];
    const comparable = periods.filter((period) => isFiniteNumber(metricValue(period)));
    const monthly = comparable.filter((period) => period.type === "MONTH");
    const yearly = comparable.filter((period) => period.type === "YEAR");
    const primary = monthly.length ? monthly : yearly;
    const profitable = primary.filter((period) => metricValue(period) > 0);
    const best = primary.length
        ? primary.reduce((current, period) =>
            metricValue(period) > metricValue(current) ? period : current
        )
        : null;
    const worst = primary.length
        ? primary.reduce((current, period) =>
            metricValue(period) < metricValue(current) ? period : current
        )
        : null;

    return {
        monthlyCount: monthly.length,
        yearlyCount: yearly.length,
        profitableCount: profitable.length,
        profitablePercent: primary.length
            ? profitable.length / primary.length * 100
            : null,
        primaryType: monthly.length ? "MONTH" : yearly.length ? "YEAR" : null,
        metricKey,
        best,
        worst,
    };
}
