import {
    calculatePeriodInsights,
    createFollowUpName,
    createHistoricalExportBaseName,
    createHistoricalJson,
    createHistoricalRunsCsv,
    createRunComparison,
    filterRuns,
    isStrategyParameterEnabled,
} from "./dashboard-analysis.js";

const strategySelect = document.querySelector("#strategy");
const parameterContainer = document.querySelector("#strategy-parameters");
const form = document.querySelector("#research-form");
const resultPanel = document.querySelector("#result-panel");
const executionPanel = document.querySelector("#execution-panel");
const errorPanel = document.querySelector("#error-panel");
const requestStatus = document.querySelector("#request-status");
const executionStatus = document.querySelector("#execution-status");
const runButton = document.querySelector("#run-button");
const saveDefaultsButton = document.querySelector("#save-defaults-button");
const resetDefaultsButton = document.querySelector("#reset-defaults-button");
const defaultsStatus = document.querySelector("#defaults-status");
const userCard = document.querySelector("#user-card");
const userEmail = document.querySelector("#user-email");
const userRole = document.querySelector("#user-role");

let strategies = [];
let plannedConfig = null;

const RESEARCH_DEFAULTS_STORAGE_KEY = "forexResearchDefaultsV1";

let executionTimer = null;
let executionStartedAt = null;

function formatElapsed(ms) {
    return `${(ms / 1000).toFixed(1)} s`;
}

function startExecutionTimer() {
    executionStartedAt = performance.now();
    executionStatus.textContent = "Running... 0.0";

    executionTimer = window.setInterval(() => {
        const elapsed = performance.now() - executionStartedAt;
        executionStatus.textContent = `Running... ${formatElapsed(elapsed)}`;
    }, 100);
}

function stopExecutionTimer(message) {
    if (executionTimer !== null) {
        window.clearInterval(executionTimer);
        executionTimer = null;
    }

    const elapsed = executionStartedAt === null
        ? 0
        : performance.now() - executionStartedAt;

    executionStartedAt = null;
    executionStatus.textContent = `${message} ${formatElapsed(elapsed)}`;
}

async function readJsonResponse(response) {
    const text = await response.text();

    try {
        return text ? JSON.parse(text) : {};
    } catch {
        const readableText = text
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 240);
        throw new Error(
            `Server returned HTTP ${response.status} ${response.statusText || ""}`.trim()
            + (readableText ? `: ${readableText}` : " without a readable response")
        );
    }
}

function toIso(localDateTime) {
    if (!localDateTime) {
        return "";
    }

    return new Date(localDateTime).toISOString();
}

function parseTypedValue(rawValue, parameter) {
    if (parameter.type === "number") {
        return Number(rawValue);
    }

    if (parameter.type === "integer") {
        return Number.parseInt(rawValue, 10);
    }

    if (parameter.type === "boolean") {
        return rawValue === "true";
    }

    return rawValue;
}

function createBaseControl(parameter) {
    let control;

    if (parameter.options) {
        control = document.createElement("select");

        for (const option of parameter.options) {
            const optionElement = document.createElement("option");
            optionElement.value = String(option);
            optionElement.textContent = String(option);
            control.append(optionElement);
        }
    } else if (parameter.type === "boolean") {
        control = document.createElement("select");
        control.innerHTML = '<option value="true">true</option><option value="false">false</option>';
    } else {
        control = document.createElement("input");
        control.type = parameter.type === "number" || parameter.type === "integer" ? "number" : "text";

        if (parameter.min !== undefined) {
            control.min = parameter.min;
        }

        if (parameter.max !== undefined) {
            control.max = parameter.max;
        }

        if (parameter.type === "number") {
            control.step = "any";
        } else if (parameter.type === "integer") {
            control.step = "1";
        }
    }

    control.dataset.parameterId = parameter.id;
    control.dataset.role = "base";

    if (parameter.default !== undefined) {
        control.value = String(parameter.default);
    }

    if (parameter.required) {
        control.required = true;
    }

    return control;
}

function conditionsForParameter(parameter) {
    if (parameter.enabledWhen === undefined) {
        return [];
    }

    return Array.isArray(parameter.enabledWhen)
        ? parameter.enabledWhen
        : [parameter.enabledWhen];
}

function readParameterFormValues(strategy) {
    const baseValues = {};
    const sweepValues = {};

    for (const parameter of strategy.parameters) {
        const baseControl = parameterContainer.querySelector(
            `[data-role="base"][data-parameter-id="${parameter.id}"]`
        );
        const sweepControl = parameterContainer.querySelector(
            `[data-role="sweep"][data-parameter-id="${parameter.id}"]`
        );

        if (baseControl?.value !== "") {
            baseValues[parameter.id] = parseTypedValue(baseControl.value, parameter);
        }

        if (sweepControl?.value.trim()) {
            sweepValues[parameter.id] = sweepControl.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
                .map((value) => parseTypedValue(value, parameter));
        }
    }

    return { baseValues, sweepValues };
}

function updateParameterDependencies(strategy = selectedStrategy()) {
    if (!strategy) {
        return;
    }

    const { baseValues, sweepValues } = readParameterFormValues(strategy);

    for (const parameter of strategy.parameters) {
        const row = parameterContainer.querySelector(
            `.parameter-row[data-parameter-id="${parameter.id}"]`
        );

        if (!row) {
            continue;
        }

        const enabled = isStrategyParameterEnabled(
            strategy,
            parameter.id,
            baseValues,
            sweepValues
        );
        row.hidden = !enabled;
        row.setAttribute("aria-hidden", String(!enabled));
        row.setAttribute("aria-disabled", String(!enabled));

        for (const control of row.querySelectorAll("input, select")) {
            control.disabled = !enabled;
        }
    }
}

function renderParameters(strategy) {
    parameterContainer.replaceChildren();

    for (const parameter of strategy.parameters) {
        const row = document.createElement("div");
        row.className = "parameter-row";
        row.dataset.parameterId = parameter.id;

        const description = parameter.description
            ? `<span class="parameter-description">${parameter.description}</span>`
            : "";

        const label = document.createElement("div");
        label.className = "parameter-name";
        label.innerHTML = `<strong>${parameter.label}</strong>${description}`;

        const conditions = conditionsForParameter(parameter);

        if (conditions.length > 0) {
            const dependency = document.createElement("span");
            dependency.className = "parameter-dependency";
            dependency.textContent = "Available when " + conditions.map((condition) => {
                const controller = strategy.parameters.find(
                    (candidate) => candidate.id === condition.parameter
                );
                return `${controller?.label ?? condition.parameter} = ${condition.equals}`;
            }).join(" and ");
            label.append(dependency);
        }

        const baseWrap = document.createElement("label");
        baseWrap.innerHTML = "<span>Base</span>";
        baseWrap.append(createBaseControl(parameter));

        row.append(label, baseWrap);

        if (parameter.sweepable) {
            const sweepWrap = document.createElement("label");
            sweepWrap.innerHTML = "<span>Sweep values</span>";

            const sweepInput = document.createElement("input");
            sweepInput.type = "text";
            sweepInput.placeholder = "Optional: value1, value2";
            sweepInput.dataset.parameterId = parameter.id;
            sweepInput.dataset.role = "sweep";

            sweepWrap.append(sweepInput);
            row.append(sweepWrap);
        } else {
            const fixed = document.createElement("div");
            fixed.className = "fixed-parameter";
            fixed.textContent = "Fixed parameter";
            row.append(fixed);
        }

        parameterContainer.append(row);
    }

    updateParameterDependencies(strategy);
}

parameterContainer.addEventListener("input", () => updateParameterDependencies());
parameterContainer.addEventListener("change", () => updateParameterDependencies());

function readResearchDefaults() {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(RESEARCH_DEFAULTS_STORAGE_KEY));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : { global: {}, strategies: {} };
    } catch {
        return { global: {}, strategies: {} };
    }
}

function setControlValue(selector, value) {
    const control = document.querySelector(selector);

    if (!control || value === undefined || value === null) {
        return;
    }

    const stringValue = String(value);

    if (
        control.tagName === "SELECT"
        && ![...control.options].some((option) => option.value === stringValue)
    ) {
        return;
    }

    control.value = stringValue;
}

function applyStrategyDefaults(strategyId) {
    const saved = readResearchDefaults().strategies?.[strategyId];

    if (!saved) {
        return;
    }

    for (const [parameterId, value] of Object.entries(saved.base ?? {})) {
        setControlValue(
            `[data-role="base"][data-parameter-id="${parameterId}"]`,
            value
        );
    }

    for (const [parameterId, value] of Object.entries(saved.sweep ?? {})) {
        setControlValue(
            `[data-role="sweep"][data-parameter-id="${parameterId}"]`,
            value
        );
    }

    updateParameterDependencies();
}

function collectCurrentDefaults() {
    const base = {};
    const sweep = {};

    for (const control of parameterContainer.querySelectorAll("[data-parameter-id]")) {
        const target = control.dataset.role === "sweep" ? sweep : base;
        target[control.dataset.parameterId] = control.value;
    }

    return { base, sweep };
}

function saveCurrentDefaults() {
    const strategy = selectedStrategy();

    if (!strategy) {
        return;
    }

    const current = readResearchDefaults();
    const next = {
        global: current.global ?? {},
        strategies: {
            ...(current.strategies ?? {}),
            [strategy.id]: collectCurrentDefaults(),
        },
    };

    try {
        window.localStorage.setItem(RESEARCH_DEFAULTS_STORAGE_KEY, JSON.stringify(next));
        defaultsStatus.textContent = `${strategy.name} defaults saved in this browser.`;
    } catch {
        defaultsStatus.textContent = "This browser did not allow the defaults to be saved.";
    }
}

function resetSavedDefaults() {
    const strategy = selectedStrategy();
    const current = readResearchDefaults();
    const strategiesWithoutCurrent = { ...(current.strategies ?? {}) };

    if (strategy) {
        delete strategiesWithoutCurrent[strategy.id];
    }

    try {
        window.localStorage.setItem(RESEARCH_DEFAULTS_STORAGE_KEY, JSON.stringify({
            global: current.global ?? {},
            strategies: strategiesWithoutCurrent,
        }));
    } catch {
        // The controls can still be reset even if browser storage is unavailable.
    }

    if (strategy) {
        renderParameters(strategy);
    }

    defaultsStatus.textContent = `${strategy?.name ?? "Strategy"} defaults reset to built-in values.`;
}

function selectedStrategy() {
    return strategies.find((strategy) => strategy.id === strategySelect.value);
}

function buildConfig() {
    const strategy = selectedStrategy();
    const strategyConfig = {};
    const parameterGrid = {};

    for (const parameter of strategy.parameters) {
        const baseControl = document.querySelector(
            `[data-role="base"][data-parameter-id="${parameter.id}"]`
        );

        if (baseControl.value !== "") {
            strategyConfig[parameter.id] = parseTypedValue(baseControl.value, parameter);
        }

        const sweepControl = document.querySelector(
            `[data-role="sweep"][data-parameter-id="${parameter.id}"]`
        );

        if (sweepControl?.value.trim() && !sweepControl.disabled) {
            parameterGrid[parameter.id] = sweepControl.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
                .map((value) => parseTypedValue(value, parameter));
        }
    }

    return {
        name: document.querySelector("#experiment-name").value.trim() || undefined,
        strategy: strategy.id,
        market: {
            instrument: document.querySelector("#instrument").value.trim(),
            strategyTimeframe: document.querySelector("#strategy-timeframe").value.trim(),
            executionTimeframe: document.querySelector("#execution-timeframe").value.trim(),
            from: toIso(document.querySelector("#from").value),
            to: toIso(document.querySelector("#to").value),
        },
        account: {
            initialCapital: Number(document.querySelector("#initial-capital").value),
            currency: document.querySelector("#currency").value.trim().toUpperCase(),
            leverage: Number(document.querySelector("#leverage").value),
            positionMode: "HEDGING",
            defaultSizing: {
                type: document.querySelector("#sizing-type").value,
                value: Number(document.querySelector("#sizing-value").value),
            },
        },
        execution: {
            sameCandleConflict: document.querySelector("#same-candle-conflict").value,
            slippagePips: 0,
            commission: {
                type: "NONE",
                value: 0,
            },
            closeOpenTradesAtEnd: true,
        },
        strategyConfig,
        parameterGrid,       
    };
}

function summaryCard(label, value) {
    return `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`;
}

function formatMetric(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "-";
    }

    return Number(value).toFixed(digits);
}

function renderResult(config, response) {
    const { plan, usageEstimate, executionGate } = response;

    document.querySelector("#summary-cards").innerHTML = [
        summaryCard("Experiment", config.name || "Untagged"),
        summaryCard("Strategy", plan.strategy.name),
        summaryCard("Requested runs", plan.research.requestedCombinations),
        summaryCard("Valid runs", plan.research.validCombinations),
        summaryCard("Plan allowed", plan.allowed ? "Yes" : "No"),
    ].join("");

    document.querySelector("#usage-cards").innerHTML = [
        summaryCard("Date range", `${usageEstimate.dateRangeDays} days`),
        summaryCard("Estimated dataset rows", usageEstimate.estimatedDatasetRows.toLocaleString()),
        summaryCard("Estimated candle evaluations", usageEstimate.estimatedCandleEvaluations.toLocaleString()),
        summaryCard("Cloud execution", executionGate.allowed ? "Allowed" : "Blocked"),
    ].join("");

    const gateNote = executionGate.allowed
        ? "Within limits. Running will read D1 and execute the real backtesting engine in Cloudflare."
        : `Blocked: ${executionGate.reasons.join("; ")}`;

    document.querySelector("#estimate-note").textContent = `${usageEstimate.note} ${gateNote}`;
    document.querySelector("#config-output").textContent = JSON.stringify(config, null, 2);

    plannedConfig = executionGate.allowed ? config : null;
    runButton.hidden = !executionGate.allowed;
    runButton.disabled = false;
    executionStatus.textContent = "";
    executionPanel.hidden = true;
    errorPanel.hidden = true;
    resultPanel.hidden = false;
}

function renderExecution(response) {
    historyLoaded = false;
    lastExecutionResponse = response;
    exportActions.hidden = false;
    viewExperimentButton.hidden = !response.experimentId;
    const { execution, result } = response;
    const d1 = execution.d1;

    document.querySelector("#execution-cards").innerHTML = [
        summaryCard("Completed runs", result.totals.completedRuns),
        summaryCard("Failed runs", result.totals.failedRuns),
        summaryCard("Actual D1 rows read", d1.rowsRead.toLocaleString()),
        summaryCard("Wall time", `${execution.wallTimeMs.toLocaleString()} ms`),
        summaryCard("D1 queries", d1.queryCount),
        summaryCard("D1 duration", `${formatMetric(d1.d1DurationMs, 1)} ms`),
        summaryCard("Dataset candles", result.experiment.dataset?.strategyCandleCount ?? "-"),
        summaryCard("Execution mode", execution.mode),
    ].join("");

    const parameterNames = Object.keys(result.experiment.parameterGrid ?? {});
    const runs = [...result.runs].sort((a, b) =>
        Number(b.summary?.returnPercent ?? Number.NEGATIVE_INFINITY) -
        Number(a.summary?.returnPercent ?? Number.NEGATIVE_INFINITY)
    );

    const headings = [
        "Run",
        ...parameterNames,
        "Trades",
        "Win %",
        "PnL pips",
        "Return %",
        "PF",
        "DD %",
        "Status",
    ];

    const rows = runs.map((run) => [
        run.runNumber,
        ...parameterNames.map((name) => run.strategyConfig?.[name] ?? "-"),
        run.summary?.totalTrades ?? "-",
        formatMetric(run.summary?.winRate),
        formatMetric(run.summary?.totalPnlPips, 1),
        formatMetric(run.summary?.returnPercent),
        formatMetric(run.summary?.profitFactor),
        formatMetric(run.summary?.maxDrawdownPercent),
        run.status,
    ]);

    const table = document.querySelector("#execution-table");
    table.innerHTML = `
        <thead><tr>${headings.map((heading) => `<th>${heading}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) =>
            `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`
        ).join("")}</tbody>
    `;

    document.querySelector("#execution-note").textContent =
        "D1 rows read are actual Cloudflare query metadata. Worker CPU time is measured separately in Cloudflare Worker logs/metrics.";

    executionPanel.hidden = false;
}

async function loadCurrentUser() {
    const response = await fetch("/api/me");
    const body = await readJsonResponse(response);

    if (!response.ok) {
        throw new Error(body.error ?? "Unable to load signed-in user");
    }

    userEmail.textContent = body.user?.email ?? "Unknown user";
    userRole.textContent = body.user?.account_role ?? "";
    userCard.hidden = false;
}

async function loadStrategies() {
    const response = await fetch("/api/strategies");
    const body = await response.json();

    if (!response.ok) {
        throw new Error(body.error ?? "Unable to load strategies");
    }

    strategies = body.strategies;
    strategySelect.replaceChildren();
    const historyStrategySelect = document.querySelector("#experiment-filter-strategy");
    historyStrategySelect.replaceChildren();
    const allStrategiesOption = document.createElement("option");
    allStrategiesOption.value = "";
    allStrategiesOption.textContent = "All strategies";
    historyStrategySelect.append(allStrategiesOption);

    for (const strategy of strategies) {
        const option = document.createElement("option");
        option.value = strategy.id;
        option.textContent = strategy.name;
        strategySelect.append(option);

        const historyOption = document.createElement("option");
        historyOption.value = strategy.id;
        historyOption.textContent = strategy.name;
        historyStrategySelect.append(historyOption);
    }

    renderParameters(strategies[0]);
    applyStrategyDefaults(strategies[0].id);
}

strategySelect.addEventListener("change", () => {
    const strategy = selectedStrategy();
    renderParameters(strategy);
    applyStrategyDefaults(strategy.id);
    defaultsStatus.textContent = "";
});

saveDefaultsButton.addEventListener("click", saveCurrentDefaults);
resetDefaultsButton.addEventListener("click", resetSavedDefaults);

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    requestStatus.textContent = "Planning...";
    resultPanel.hidden = true;
    executionPanel.hidden = true;
    errorPanel.hidden = true;
    plannedConfig = null;

    try {
        const config = buildConfig();
        const response = await fetch("/api/plan", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(config),
        });
        const body = await response.json();

        if (!response.ok) {
            throw new Error(body.error ?? "Planning failed");
        }

        renderResult(config, body);
        requestStatus.textContent = "Plan validated";
    } catch (error) {
        document.querySelector("#error-output").textContent = error.message;
        errorPanel.hidden = false;
        requestStatus.textContent = "Planning failed";
    }
});

runButton.addEventListener("click", async () => {
    if (!plannedConfig) {
        return;
    }

    lastExecutionResponse = null;
    exportActions.hidden = true;
    runButton.disabled = true;
    startExecutionTimer();
    executionPanel.hidden = true;
    errorPanel.hidden = true;

    try {
        const response = await fetch("/api/experiments", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(plannedConfig),
        });
        const body = await response.json();

        if (!response.ok) {
            const details = body.executionGate?.reasons?.length
                ? `: ${body.executionGate.reasons.join("; ")}`
                : "";
            throw new Error(`${body.error ?? "Cloud execution failed"}${details}`);
        }

        renderExecution(body);
        stopExecutionTimer("Experiment complete in");
    } catch (error) {
        document.querySelector("#error-output").textContent = error.message;
        errorPanel.hidden = false;
        stopExecutionTimer("Execution failed after");
    } finally {
        runButton.disabled = false;
    }
});

loadStrategies().catch((error) => {
    document.querySelector("#error-output").textContent = error.message;
    errorPanel.hidden = false;
});

loadCurrentUser().catch(() => {
    userCard.hidden = true;
});


// === TERMINAL THEME PATCH ===
const themeChoices = [...document.querySelectorAll("[data-theme-choice]")];
const THEME_STORAGE_KEY = "forexResearchUiTheme";

function applyUiTheme(theme) {
    const normalizedTheme = theme === "terminal" ? "terminal" : "contemporary";

    if (normalizedTheme === "terminal") {
        document.documentElement.dataset.uiTheme = "terminal";
    } else {
        delete document.documentElement.dataset.uiTheme;
    }

    for (const button of themeChoices) {
        const active = button.dataset.themeChoice === normalizedTheme;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    }
}

for (const button of themeChoices) {
    button.addEventListener("click", () => {
        const theme = button.dataset.themeChoice;
        applyUiTheme(theme);
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    });
}

const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
applyUiTheme(savedTheme === "terminal" ? "terminal" : "contemporary");


// === RESULTS EXPORT PATCH ===
const exportActions = document.querySelector("#export-actions");
const viewExperimentButton = document.querySelector("#view-experiment-button");
const exportCsvButton = document.querySelector("#export-csv-button");
const exportJsonButton = document.querySelector("#export-json-button");

let lastExecutionResponse = null;

function downloadBlob(filename, type, content) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    const text = typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

    if (/[",\r\n]/.test(text)) {
        return "\"" + text.replaceAll("\"", "\"\"") + "\"";
    }

    return text;
}

function safeFilenamePart(value, fallback) {
    const text = String(value ?? fallback ?? "")
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return text || fallback || "export";
}

function datePart(value) {
    const time = Date.parse(value);

    if (!Number.isFinite(time)) {
        return "date";
    }

    return new Date(time).toISOString().slice(0, 10);
}

function createExportBaseName(response) {
    const result = response?.result ?? {};
    const experiment = result.experiment ?? {};
    const backtest = experiment.backtest ?? {};
    const strategy = experiment.strategy ?? {};
    const strategyId = strategy.id ?? strategy.name ?? "strategy";
    const instrument = backtest.instrument ?? "instrument";
    const timeframe = backtest.strategyTimeframe ?? "tf";
    const runCount = result.runs?.length ?? 0;

    return [
        safeFilenamePart(strategyId, "strategy"),
        safeFilenamePart(instrument, "instrument"),
        safeFilenamePart(timeframe, "tf"),
        datePart(backtest.from),
        datePart(backtest.to),
        String(runCount) + "-runs",
    ].join("_");
}

function collectStrategyParameterNames(runs) {
    const names = new Set();

    for (const run of runs) {
        for (const name of Object.keys(run.strategyConfig ?? {})) {
            names.add(name);
        }
    }

    return [...names];
}

function createRunsCsv(response) {
    const result = response?.result ?? {};
    const experiment = result.experiment ?? {};
    const backtest = experiment.backtest ?? {};
    const runs = result.runs ?? [];
    const parameterNames = collectStrategyParameterNames(runs);

    const fixedColumns = [
        "runNumber",
        "status",
        "instrument",
        "strategyTimeframe",
        "executionTimeframe",
        "from",
        "to",
    ];

    const metricColumns = [
        ["totalTrades", "totalTrades"],
        ["winRate", "winRate"],
        ["totalPnlPips", "totalPnlPips"],
        ["returnPercent", "returnPercent"],
        ["profitFactor", "profitFactor"],
        ["maxDrawdownPercent", "maxDrawdownPercent"],
    ];

    const headings = [
        ...fixedColumns,
        ...parameterNames.map((name) => "parameter." + name),
        ...metricColumns.map(([heading]) => heading),
        "error",
    ];

    const rows = runs.map((run) => {
        const summary = run.summary ?? {};
        const error = run.error?.message ?? run.error ?? "";

        return [
            run.runNumber,
            run.status,
            backtest.instrument ?? "",
            backtest.strategyTimeframe ?? "",
            backtest.executionTimeframe ?? "",
            backtest.from ?? "",
            backtest.to ?? "",
            ...parameterNames.map((name) => run.strategyConfig?.[name] ?? ""),
            ...metricColumns.map(([, key]) => summary[key] ?? ""),
            error,
        ];
    });

    return [headings, ...rows]
        .map((row) => row.map(csvValue).join(","))
        .join("\r\n");
}

exportCsvButton.addEventListener("click", () => {
    if (!lastExecutionResponse) {
        return;
    }

    const filename = createExportBaseName(lastExecutionResponse) + ".csv";
    const csv = createRunsCsv(lastExecutionResponse);
    downloadBlob(filename, "text/csv;charset=utf-8", "\uFEFF" + csv);
});

exportJsonButton.addEventListener("click", () => {
    if (!lastExecutionResponse) {
        return;
    }

    const filename = createExportBaseName(lastExecutionResponse) + ".json";
    const json = JSON.stringify(lastExecutionResponse, null, 2);
    downloadBlob(filename, "application/json;charset=utf-8", json);
});

viewExperimentButton.addEventListener("click", async () => {
    const experimentId = lastExecutionResponse?.experimentId;

    if (!experimentId) {
        return;
    }

    historyLoaded = true;
    setWorkspaceView("history");
    historyLoaded = false;
    await loadExperimentDetail(experimentId);
});


// === SAVED RESEARCH DASHBOARD ===
const researchView = document.querySelector("#research-view");
const historyView = document.querySelector("#history-view");
const historyListPanel = document.querySelector("#history-list-panel");
const historyDetailPanel = document.querySelector("#history-detail-panel");
const historyTable = document.querySelector("#history-table");
const historyRunsTable = document.querySelector("#history-runs-table");
const historyStatus = document.querySelector("#history-status");
const historyEmpty = document.querySelector("#history-empty");
const refreshHistoryButton = document.querySelector("#refresh-history-button");
const experimentFilterForm = document.querySelector("#experiment-filter-form");
const clearExperimentFiltersButton = document.querySelector("#clear-experiment-filters-button");
const loadMoreExperimentsButton = document.querySelector("#load-more-experiments-button");
const backToHistoryButton = document.querySelector("#back-to-history-button");
const historyExportCsvButton = document.querySelector("#history-export-csv-button");
const historyExportJsonButton = document.querySelector("#history-export-json-button");
const experimentErrorFeedback = document.querySelector("#experiment-error-feedback");
const compareRunsButton = document.querySelector("#compare-runs-button");
const clearComparisonButton = document.querySelector("#clear-comparison-button");
const closeComparisonButton = document.querySelector("#close-comparison-button");
const clearRunFiltersButton = document.querySelector("#clear-run-filters-button");
const comparisonPanel = document.querySelector("#comparison-panel");
const comparisonTable = document.querySelector("#comparison-table");
const detailedRerunButton = document.querySelector("#detailed-rerun-button");
const detailedRerunStatus = document.querySelector("#detailed-rerun-status");
const detailedRerunFeedback = document.querySelector("#detailed-rerun-feedback");
const detailedDataPanel = document.querySelector("#detailed-data-panel");
const validationComparisonPanel = document.querySelector("#validation-comparison-panel");
const validationComparisonTable = document.querySelector("#validation-comparison-table");
const runTradesTable = document.querySelector("#run-trades-table");
const runEventsTable = document.querySelector("#run-events-table");
const tradeExportCsvButton = document.querySelector("#trade-export-csv-button");
const tradeExportJsonButton = document.querySelector("#trade-export-json-button");
const useRunButton = document.querySelector("#use-run-button");
const setRunDefaultsButton = document.querySelector("#set-run-defaults-button");
const validationTabEmpty = document.querySelector("#validation-tab-empty");
const detailTabButtons = [...document.querySelectorAll("[data-detail-tab]")];
const detailTabPanels = [...document.querySelectorAll("[data-detail-tab-panel]")];
const runFilterControls = [
    document.querySelector("#run-filter-status"),
    document.querySelector("#run-filter-minimum-trades"),
    document.querySelector("#run-filter-minimum-return"),
    document.querySelector("#run-filter-maximum-drawdown"),
    document.querySelector("#run-filter-minimum-profit-factor"),
    document.querySelector("#run-filter-parameter-search"),
];
const viewChoices = [...document.querySelectorAll("[data-view-choice]")];

let historyLoaded = false;
let loadedExperiments = [];
let historyNextOffset = null;
let historySort = "NEWEST";
let currentExperimentDetail = null;
let selectedHistoryRunId = null;
let currentDetailedRunData = null;
let comparisonRunIds = new Set();
let runSort = { key: "returnPercent", direction: "desc" };

function setDetailTab(tabName) {
    const targetButton = detailTabButtons.find(
        (button) => button.dataset.detailTab === tabName
    );

    if (!targetButton || targetButton.disabled) {
        return;
    }

    for (const button of detailTabButtons) {
        const active = button === targetButton;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
    }

    for (const panel of detailTabPanels) {
        panel.hidden = panel.dataset.detailTabPanel !== tabName;
    }
}

function setDetailTabEnabled(tabName, enabled) {
    const button = detailTabButtons.find(
        (item) => item.dataset.detailTab === tabName
    );

    if (button) {
        button.disabled = !enabled;
    }
}

function formatDateTime(value) {
    const time = Date.parse(value);

    if (!Number.isFinite(time)) {
        return "-";
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(time));
}

function formatDate(value) {
    const time = Date.parse(value);

    if (!Number.isFinite(time)) {
        return "-";
    }

    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(time));
}

function displayValue(value, digits = 2) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    if (typeof value === "number") {
        return Number.isInteger(value)
            ? value.toLocaleString()
            : value.toLocaleString(undefined, { maximumFractionDigits: digits });
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}

function percentValue(value) {
    return value === null || value === undefined
        ? "-"
        : `${displayValue(value)}%`;
}

function renderDashboardCards(container, items) {
    container.replaceChildren();

    for (const [label, value] of items) {
        const card = document.createElement("div");
        const labelElement = document.createElement("span");
        const valueElement = document.createElement("strong");

        card.className = "summary-card";
        labelElement.textContent = label;
        valueElement.textContent = displayValue(value);
        card.append(labelElement, valueElement);
        container.append(card);
    }
}

function createTextCell(value) {
    const cell = document.createElement("td");
    cell.textContent = displayValue(value);
    return cell;
}

function setWorkspaceView(view) {
    const showHistory = view === "history";
    researchView.hidden = showHistory;
    historyView.hidden = !showHistory;
    errorPanel.hidden = true;

    for (const button of viewChoices) {
        const active = button.dataset.viewChoice === view;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    }

    if (showHistory && !historyLoaded) {
        loadExperimentHistory();
    }
}

function renderHistoryTable(experiments) {
    historyTable.replaceChildren();

    const columns = [
        { label: "Created", sorts: ["NEWEST", "OLDEST"] },
        { label: "Strategy" },
        { label: "Market" },
        { label: "Period" },
        { label: "Runs", sorts: ["MOST_RUNS", "LEAST_RUNS"] },
        { label: "Best return", sorts: ["BEST_RETURN", "WORST_RETURN"] },
        { label: "Wall time", sorts: ["FASTEST", "SLOWEST"] },
        { label: "Status" },
    ];
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");

    for (const column of columns) {
        const cell = document.createElement("th");

        if (column.sorts) {
            const activeIndex = column.sorts.indexOf(historySort);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = column.label + (activeIndex === -1
                ? ""
                : historySort === "OLDEST" || historySort === "LEAST_RUNS" || historySort === "WORST_RETURN" || historySort === "FASTEST"
                    ? " ↑"
                    : " ↓");
            button.setAttribute("aria-label", `Sort by ${column.label}`);
            button.addEventListener("click", () => {
                historySort = activeIndex === 0 ? column.sorts[1] : column.sorts[0];
                historyLoaded = false;
                loadExperimentHistory({ reset: true });
            });
            cell.className = "sortable-heading";
            cell.append(button);
        } else {
            cell.textContent = column.label;
        }

        headingRow.append(cell);
    }

    head.append(headingRow);
    historyTable.append(head);

    const body = document.createElement("tbody");

    for (const experiment of experiments) {
        const row = document.createElement("tr");
        const market = experiment.market;
        row.className = "history-row";
        row.tabIndex = 0;
        row.append(
            createTextCell(formatDateTime(experiment.createdAt)),
            createTextCell(experiment.name || experiment.strategy.name),
            createTextCell(`${market.instrument} · ${market.strategyTimeframe}`),
            createTextCell(`${formatDate(market.from)} – ${formatDate(market.to)}`),
            createTextCell(`${experiment.completedRuns}/${experiment.validRuns}`),
            createTextCell(percentValue(experiment.performance.bestReturnPercent)),
            createTextCell(experiment.wallTimeMs === null
                ? "-"
                : `${experiment.wallTimeMs.toLocaleString()} ms`),
            createTextCell(experiment.status)
        );

        const open = () => loadExperimentDetail(experiment.id);
        row.addEventListener("click", open);
        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
            }
        });
        body.append(row);
    }

    historyTable.append(body);
}

function appendHistoryQuery(params, name, value) {
    if (value !== "" && value !== null && value !== undefined) {
        params.set(name, value);
    }
}

function createHistoryQuery(offset) {
    const params = new URLSearchParams({
        limit: "25",
        offset: String(offset),
        sort: historySort,
    });
    const createdFrom = document.querySelector("#experiment-filter-created-from").value;
    const createdTo = document.querySelector("#experiment-filter-created-to").value;

    appendHistoryQuery(params, "status", document.querySelector("#experiment-filter-status").value);
    appendHistoryQuery(params, "strategy", document.querySelector("#experiment-filter-strategy").value);
    appendHistoryQuery(params, "instrument", document.querySelector("#experiment-filter-instrument").value.trim());
    appendHistoryQuery(params, "timeframe", document.querySelector("#experiment-filter-timeframe").value.trim());
    appendHistoryQuery(params, "minimumCompletedRuns", document.querySelector("#experiment-filter-minimum-runs").value);
    appendHistoryQuery(params, "minimumBestReturn", document.querySelector("#experiment-filter-minimum-return").value);
    appendHistoryQuery(params, "search", document.querySelector("#experiment-filter-search").value.trim());

    if (createdFrom) {
        params.set("createdFrom", `${createdFrom}T00:00:00.000Z`);
    }

    if (createdTo) {
        params.set("createdTo", `${createdTo}T23:59:59.999Z`);
    }

    return params;
}

function renderHistorySummary(experiments) {
    const completed = experiments.filter((item) => item.status === "COMPLETED");
    const totalRuns = experiments.reduce(
        (total, item) => total + (item.completedRuns ?? 0),
        0
    );
    const bestReturns = experiments
        .map((item) => item.performance?.bestReturnPercent)
        .filter((value) => Number.isFinite(value));
    const bestReturn = bestReturns.length ? Math.max(...bestReturns) : null;

    renderDashboardCards(
        document.querySelector("#history-summary-cards"),
        [
            ["Experiments loaded", experiments.length],
            ["Completed", completed.length],
            ["Completed runs", totalRuns],
            ["Best loaded return", percentValue(bestReturn)],
        ]
    );
}

function clearExperimentFilters() {
    document.querySelector("#experiment-filter-status").value = "";
    document.querySelector("#experiment-filter-strategy").value = "";
    document.querySelector("#experiment-filter-instrument").value = "";
    document.querySelector("#experiment-filter-timeframe").value = "";
    document.querySelector("#experiment-filter-minimum-runs").value = "";
    document.querySelector("#experiment-filter-minimum-return").value = "";
    document.querySelector("#experiment-filter-created-from").value = "";
    document.querySelector("#experiment-filter-created-to").value = "";
    document.querySelector("#experiment-filter-search").value = "";
    historySort = "NEWEST";
}

async function loadExperimentHistory({ reset = true } = {}) {
    const offset = reset ? 0 : historyNextOffset;

    if (offset === null) {
        return;
    }

    historyStatus.hidden = false;
    historyStatus.textContent = reset ? "Loading experiments…" : "Loading more experiments…";
    if (reset) {
        historyEmpty.hidden = true;
    }
    refreshHistoryButton.disabled = true;
    loadMoreExperimentsButton.disabled = true;
    experimentFilterForm.querySelector('button[type="submit"]').disabled = true;

    try {
        const response = await fetch(`/api/experiments?${createHistoryQuery(offset)}`);
        const body = await response.json();

        if (!response.ok) {
            throw new Error(body.error ?? "Unable to load experiment history");
        }

        const page = body.experiments ?? [];
        const combined = reset ? page : [...loadedExperiments, ...page];
        loadedExperiments = [...new Map(
            combined.map((experiment) => [experiment.id, experiment])
        ).values()];
        historyNextOffset = body.pagination?.nextOffset ?? null;

        document.querySelector("#history-workspace").textContent =
            `${body.workspace.name} · saved cloud research`;
        renderHistorySummary(loadedExperiments);
        renderHistoryTable(loadedExperiments);
        historyStatus.textContent = historyNextOffset === null
            ? `${loadedExperiments.length} matching experiment${loadedExperiments.length === 1 ? "" : "s"} loaded`
            : `${loadedExperiments.length} matching experiments loaded · more available`;
        historyEmpty.hidden = loadedExperiments.length !== 0;
        historyTable.hidden = loadedExperiments.length === 0;
        loadMoreExperimentsButton.hidden = historyNextOffset === null;
        historyLoaded = true;
    } catch (error) {
        historyStatus.textContent = `Unable to load history: ${error.message}`;
        if (reset) {
            loadedExperiments = [];
            historyNextOffset = null;
            historyTable.replaceChildren();
            loadMoreExperimentsButton.hidden = true;
        }
    } finally {
        refreshHistoryButton.disabled = false;
        loadMoreExperimentsButton.disabled = false;
        experimentFilterForm.querySelector('button[type="submit"]').disabled = false;
    }
}

function runColumnDefinitions(runs) {
    const parameterNames = new Set();

    for (const run of runs) {
        for (const name of Object.keys(run.parameterValues ?? {})) {
            parameterNames.add(name);
        }
    }

    return [
        { key: "runNumber", label: "Run", value: (run) => run.runNumber },
        ...[...parameterNames].map((name) => ({
            key: `parameter:${name}`,
            label: name,
            value: (run) => run.parameterValues?.[name],
        })),
        { key: "totalTrades", label: "Trades", value: (run) => run.summary?.totalTrades },
        { key: "winRate", label: "Win %", value: (run) => run.summary?.winRate },
        { key: "netPnlAccount", label: "Net P&L", value: (run) => run.summary?.netPnlAccount },
        { key: "returnPercent", label: "Return %", value: (run) => run.summary?.returnPercent },
        { key: "profitFactor", label: "PF", value: (run) => run.summary?.profitFactor },
        { key: "maxDrawdownPercent", label: "DD %", value: (run) => run.summary?.maxDrawdownPercent },
        { key: "expectancyPips", label: "Exp. pips", value: (run) => run.summary?.expectancyPips },
        { key: "averageMfePips", label: "Avg MFE", value: (run) => run.summary?.averageMfePips },
        { key: "averageMaePips", label: "Avg MAE", value: (run) => run.summary?.averageMaePips },
        { key: "elapsedMs", label: "Time ms", value: (run) => run.elapsedMs },
        { key: "status", label: "Status", value: (run) => run.status },
    ];
}

function compareRunValues(left, right) {
    const leftMissing = left === null || left === undefined;
    const rightMissing = right === null || right === undefined;

    if (leftMissing || rightMissing) {
        return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;
    }

    if (typeof left === "number" && typeof right === "number") {
        return left - right;
    }

    return String(left).localeCompare(String(right), undefined, {
        numeric: true,
        sensitivity: "base",
    });
}

function optionalNumber(selector) {
    const value = document.querySelector(selector).value;
    return value === "" ? null : Number(value);
}

function readRunFilters() {
    return {
        status: document.querySelector("#run-filter-status").value,
        minimumTrades: optionalNumber("#run-filter-minimum-trades"),
        minimumReturnPercent: optionalNumber("#run-filter-minimum-return"),
        maximumDrawdownPercent: optionalNumber("#run-filter-maximum-drawdown"),
        minimumProfitFactor: optionalNumber("#run-filter-minimum-profit-factor"),
        parameterSearch: document.querySelector("#run-filter-parameter-search").value,
    };
}

function clearRunFilters() {
    document.querySelector("#run-filter-status").value = "ALL";
    document.querySelector("#run-filter-minimum-trades").value = "";
    document.querySelector("#run-filter-minimum-return").value = "";
    document.querySelector("#run-filter-maximum-drawdown").value = "";
    document.querySelector("#run-filter-minimum-profit-factor").value = "";
    document.querySelector("#run-filter-parameter-search").value = "";
}

function updateComparisonControls() {
    const count = comparisonRunIds.size;
    compareRunsButton.disabled = count < 2;
    compareRunsButton.textContent = count < 2
        ? "Compare selected"
        : `Compare ${count} runs`;
    clearComparisonButton.disabled = count === 0;
}

function toggleComparisonRun(runId, selected) {
    if (selected && comparisonRunIds.size < 4) {
        comparisonRunIds.add(runId);
    } else if (!selected) {
        comparisonRunIds.delete(runId);
    }

    updateComparisonControls();
    renderRunsTable();
}

function renderRunsTable() {
    const allRuns = currentExperimentDetail?.runs ?? [];
    const runs = filterRuns(allRuns, readRunFilters());
    const columns = runColumnDefinitions(runs);
    const sortColumn = columns.find((column) => column.key === runSort.key)
        ?? columns[0];
    const direction = runSort.direction === "asc" ? 1 : -1;
    const sortedRuns = [...runs].sort((left, right) =>
        compareRunValues(sortColumn.value(left), sortColumn.value(right)) * direction
    );

    historyRunsTable.replaceChildren();
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    const comparisonHeading = document.createElement("th");
    comparisonHeading.textContent = "Compare";
    headingRow.append(comparisonHeading);

    for (const column of columns) {
        const cell = document.createElement("th");
        const button = document.createElement("button");
        const active = column.key === sortColumn.key;
        cell.className = "sortable-heading";
        button.type = "button";
        button.textContent = `${column.label}${active ? runSort.direction === "asc" ? " ↑" : " ↓" : ""}`;
        button.addEventListener("click", () => {
            runSort = {
                key: column.key,
                direction: runSort.key === column.key && runSort.direction === "desc"
                    ? "asc"
                    : "desc",
            };
            renderRunsTable();
        });
        cell.append(button);
        headingRow.append(cell);
    }

    head.append(headingRow);
    historyRunsTable.append(head);

    const body = document.createElement("tbody");

    for (const run of sortedRuns) {
        const row = document.createElement("tr");
        row.className = "history-row";
        row.tabIndex = 0;
        row.classList.toggle("is-selected", run.id === selectedHistoryRunId);

        const comparisonCell = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = comparisonRunIds.has(run.id);
        checkbox.disabled = comparisonRunIds.size >= 4 && !checkbox.checked;
        checkbox.setAttribute("aria-label", `Compare run ${run.runNumber}`);
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        checkbox.addEventListener("change", () =>
            toggleComparisonRun(run.id, checkbox.checked)
        );
        comparisonCell.append(checkbox);
        row.append(comparisonCell);

        for (const column of columns) {
            row.append(createTextCell(column.value(run)));
        }

        const select = () => renderRunDetail(run);
        row.addEventListener("click", select);
        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select();
            }
        });
        body.append(row);
    }

    if (sortedRuns.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = columns.length + 1;
        cell.textContent = "No runs match the current filters.";
        row.append(cell);
        body.append(row);
    }

    historyRunsTable.append(body);
    document.querySelector("#run-filter-count").textContent =
        `${runs.length} of ${allRuns.length} runs shown · ${comparisonRunIds.size} selected`;
}

function humanizeMetric(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/^./, (letter) => letter.toUpperCase());
}

function renderPeriodTable(periods) {
    const table = document.querySelector("#run-period-table");
    table.replaceChildren();
    const headings = ["Period", "Trades", "Win %", "PnL pips", "P&L account", "PF pips", "PF account", "DD pips", "DD account"];
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");

    for (const heading of headings) {
        const cell = document.createElement("th");
        cell.textContent = heading;
        headingRow.append(cell);
    }

    head.append(headingRow);
    table.append(head);
    const body = document.createElement("tbody");

    for (const period of periods) {
        const summary = period.summary ?? {};
        const row = document.createElement("tr");
        row.append(
            createTextCell(`${period.type === "MONTH" ? "Month" : "Year"} ${period.key}`),
            createTextCell(summary.totalTrades),
            createTextCell(summary.winRate),
            createTextCell(summary.totalPnlPips),
            createTextCell(summary.totalPnlAccount),
            createTextCell(summary.profitFactor),
            createTextCell(summary.profitFactorAccount),
            createTextCell(summary.maxDrawdownPips),
            createTextCell(summary.closedTradeMaxDrawdownAccount)
        );
        body.append(row);
    }

    if (periods.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = headings.length;
        cell.textContent = "No period summaries were recorded for this run.";
        row.append(cell);
        body.append(row);
    }

    table.append(body);
}

function renderPeriodInsights(periods) {
    const insights = calculatePeriodInsights(periods);
    const primaryLabel = insights.primaryType === "MONTH"
        ? "months"
        : insights.primaryType === "YEAR"
            ? "years"
            : "periods";
    const metricUnit = insights.metricKey === "totalPnlAccount" ? "account" : "pips";
    const metricValue = (period) => period?.summary?.[insights.metricKey];
    const best = insights.best
        ? `${insights.best.key} · ${displayValue(metricValue(insights.best))} ${metricUnit}`
        : "-";
    const worst = insights.worst
        ? `${insights.worst.key} · ${displayValue(metricValue(insights.worst))} ${metricUnit}`
        : "-";

    renderDashboardCards(
        document.querySelector("#period-insight-cards"),
        [
            ["Months recorded", insights.monthlyCount],
            ["Years recorded", insights.yearlyCount],
            [`Profitable ${primaryLabel}`, percentValue(insights.profitablePercent)],
            ["Best period", best],
            ["Worst period", worst],
        ]
    );

    const chart = document.querySelector("#period-chart");
    const preferredPeriods = periods.filter((period) =>
        period.type === (insights.primaryType ?? "MONTH")
        && Number.isFinite(metricValue(period))
    );
    chart.replaceChildren();
    chart.hidden = preferredPeriods.length === 0;

    if (preferredPeriods.length === 0) {
        return;
    }

    const title = document.createElement("p");
    title.className = "period-chart-title";
    title.textContent = `${insights.primaryType === "MONTH" ? "Monthly" : "Yearly"} P&L · ${metricUnit}`;
    chart.append(title);

    const maximumMagnitude = Math.max(
        ...preferredPeriods.map((period) => Math.abs(metricValue(period))),
        0.01
    );

    for (const period of preferredPeriods) {
        const value = metricValue(period);
        const row = document.createElement("div");
        const label = document.createElement("span");
        const lane = document.createElement("div");
        const bar = document.createElement("span");
        const amount = document.createElement("strong");

        row.className = "period-bar-row";
        label.textContent = period.key;
        lane.className = "period-bar-lane";
        bar.className = `period-bar ${value >= 0 ? "is-positive" : "is-negative"}`;
        bar.style.width = `${Math.abs(value) / maximumMagnitude * 50}%`;

        if (value >= 0) {
            bar.style.left = "50%";
        } else {
            bar.style.right = "50%";
        }

        amount.textContent = displayValue(value);
        lane.append(bar);
        row.append(label, lane, amount);
        chart.append(row);
    }
}

function renderComparison() {
    const runs = (currentExperimentDetail?.runs ?? [])
        .filter((run) => comparisonRunIds.has(run.id))
        .sort((left, right) => left.runNumber - right.runNumber);

    if (runs.length < 2) {
        comparisonPanel.hidden = true;
        return;
    }

    comparisonTable.replaceChildren();
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    const metricHeading = document.createElement("th");
    metricHeading.textContent = "Metric";
    headingRow.append(metricHeading);

    for (const run of runs) {
        const cell = document.createElement("th");
        cell.textContent = `Run ${run.runNumber}`;
        headingRow.append(cell);
    }

    head.append(headingRow);
    comparisonTable.append(head);
    const body = document.createElement("tbody");

    for (const comparison of createRunComparison(runs)) {
        const row = document.createElement("tr");
        row.append(createTextCell(comparison.label));

        for (const value of comparison.values) {
            row.append(createTextCell(value));
        }

        body.append(row);
    }

    comparisonTable.append(body);
    document.querySelector("#comparison-subtitle").textContent =
        `${runs.length} runs · exact configurations and all shared summary metrics`;
    comparisonPanel.hidden = false;
    comparisonPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function createJsonDetailsCell(value) {
    const cell = document.createElement("td");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const output = document.createElement("pre");

    summary.textContent = "View JSON";
    output.textContent = JSON.stringify(value ?? {}, null, 2);
    details.append(summary, output);
    cell.append(details);
    return cell;
}

function renderValidationComparison(detailedRun) {
    const sourceRun = currentExperimentDetail?.sourceRun;
    validationComparisonPanel.hidden = !sourceRun;
    validationComparisonTable.replaceChildren();

    if (!sourceRun) {
        return;
    }

    const metrics = [
        ["Total trades", "totalTrades"],
        ["Wins", "wins"],
        ["Losses", "losses"],
        ["Win rate", "winRate"],
        ["P&L pips", "totalPnlPips"],
        ["Net P&L", "netPnlAccount"],
        ["Return %", "returnPercent"],
        ["Profit factor", "profitFactor"],
        ["Max drawdown %", "maxDrawdownPercent"],
        ["Average MFE", "averageMfePips"],
        ["Average MAE", "averageMaePips"],
    ];
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");

    for (const heading of ["Metric", "Original", "Detailed rerun", "Difference"]) {
        const cell = document.createElement("th");
        cell.textContent = heading;
        headingRow.append(cell);
    }

    head.append(headingRow);
    validationComparisonTable.append(head);
    const body = document.createElement("tbody");

    for (const [label, key] of metrics) {
        const original = sourceRun.summary?.[key];
        const rerun = detailedRun.summary?.[key];
        const difference = Number.isFinite(original) && Number.isFinite(rerun)
            ? rerun - original
            : null;
        const row = document.createElement("tr");
        row.append(
            createTextCell(label),
            createTextCell(displayValue(original, 4)),
            createTextCell(displayValue(rerun, 4)),
            createTextCell(displayValue(difference, 4))
        );
        body.append(row);
    }

    validationComparisonTable.append(body);
}

function renderDetailedRunData(detail) {
    currentDetailedRunData = detail;
    const trades = detail.trades ?? [];
    const events = detail.diagnosticEvents ?? [];

    document.querySelector("#detailed-data-subtitle").textContent =
        `${trades.length} trades · ${events.length} diagnostic events`;
    runTradesTable.replaceChildren();
    const tradeHead = document.createElement("thead");
    const tradeHeadingRow = document.createElement("tr");
    const tradeHeadings = [
        "#", "Side", "Result", "Entry time", "Exit time", "Entry", "Exit",
        "Units", "P&L pips", "P&L account", "Commission", "MFE", "MAE",
        "Minutes", "Entry reason", "Exit reason", "Record",
    ];

    for (const heading of tradeHeadings) {
        const cell = document.createElement("th");
        cell.textContent = heading;
        tradeHeadingRow.append(cell);
    }

    tradeHead.append(tradeHeadingRow);
    runTradesTable.append(tradeHead);
    const tradeBody = document.createElement("tbody");

    for (const trade of trades) {
        const row = document.createElement("tr");
        row.append(
            createTextCell(trade.tradeNumber),
            createTextCell(trade.side),
            createTextCell(trade.result),
            createTextCell(formatDateTime(trade.entryTime)),
            createTextCell(formatDateTime(trade.exitTime)),
            createTextCell(displayValue(trade.entryPrice, 6)),
            createTextCell(displayValue(trade.exitPrice, 6)),
            createTextCell(displayValue(trade.units)),
            createTextCell(displayValue(trade.pnlPips, 4)),
            createTextCell(displayValue(trade.pnlAccount, 4)),
            createTextCell(displayValue(trade.commissionAccount, 4)),
            createTextCell(displayValue(trade.mfePips, 4)),
            createTextCell(displayValue(trade.maePips, 4)),
            createTextCell(displayValue(trade.holdingMinutes, 2)),
            createTextCell(trade.entryReason),
            createTextCell(trade.exitReason),
            createJsonDetailsCell(trade.data)
        );
        tradeBody.append(row);
    }

    if (trades.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = tradeHeadings.length;
        cell.textContent = "The detailed rerun completed without closed trades.";
        row.append(cell);
        tradeBody.append(row);
    }

    runTradesTable.append(tradeBody);
    runEventsTable.replaceChildren();
    const eventHead = document.createElement("thead");
    const eventHeadingRow = document.createElement("tr");

    for (const heading of ["#", "Time", "Type", "Reason", "Record"]) {
        const cell = document.createElement("th");
        cell.textContent = heading;
        eventHeadingRow.append(cell);
    }

    eventHead.append(eventHeadingRow);
    runEventsTable.append(eventHead);
    const eventBody = document.createElement("tbody");

    for (const event of events) {
        const row = document.createElement("tr");
        row.append(
            createTextCell(event.eventNumber),
            createTextCell(formatDateTime(event.time)),
            createTextCell(event.type),
            createTextCell(event.reason),
            createJsonDetailsCell(event.data)
        );
        eventBody.append(row);
    }

    if (events.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = "No diagnostic events were recorded.";
        row.append(cell);
        eventBody.append(row);
    }

    runEventsTable.append(eventBody);
    detailedDataPanel.hidden = false;
}

async function loadDetailedRunData(run) {
    detailedRerunStatus.textContent = "Loading saved trades and diagnostics…";

    try {
        const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}/details`);
        const body = await readJsonResponse(response);

        if (!response.ok) {
            throw new Error(body.error ?? "Unable to load detailed run data");
        }

        if (selectedHistoryRunId !== run.id) {
            return;
        }

        renderDetailedRunData(body);
        renderValidationComparison(run);
        validationTabEmpty.hidden = true;
        setDetailTabEnabled("validation", true);
        detailedRerunStatus.textContent = "Detailed trades and diagnostic events are saved.";

        if (currentExperimentDetail?.experiment?.purpose === "DETAILED_RERUN") {
            setDetailTab("validation");
        }
    } catch (error) {
        detailedRerunStatus.textContent = `Unable to load detailed data: ${error.message}`;
    }
}

function renderRunDetail(run) {
    selectedHistoryRunId = run.id;
    renderRunsTable();
    currentDetailedRunData = null;
    detailedDataPanel.hidden = true;
    validationComparisonPanel.hidden = true;
    detailedRerunStatus.textContent = "";
    detailedRerunFeedback.hidden = true;
    detailedRerunFeedback.textContent = "";
    setDetailTabEnabled("analysis", true);
    setDetailTab("analysis");

    const panel = document.querySelector("#run-detail-panel");
    const summaryGrid = document.querySelector("#run-summary-grid");
    const parameters = Object.entries(run.parameterValues ?? {})
        .map(([name, value]) => `${name}: ${displayValue(value)}`)
        .join(" · ");

    document.querySelector("#run-detail-title").textContent = `Run ${run.runNumber}`;
    document.querySelector("#run-detail-subtitle").textContent =
        parameters || "Base strategy configuration";
    const isDetailedExperiment = currentExperimentDetail?.experiment?.purpose === "DETAILED_RERUN";
    detailedRerunButton.hidden = isDetailedExperiment;
    detailedRerunButton.disabled = run.status !== "COMPLETED";
    summaryGrid.replaceChildren();

    for (const [name, value] of Object.entries(run.summary ?? {})) {
        const item = document.createElement("div");
        const label = document.createElement("span");
        const metric = document.createElement("strong");
        item.className = "metric-item";
        label.textContent = humanizeMetric(name);
        metric.textContent = displayValue(value, 4);
        item.append(label, metric);
        summaryGrid.append(item);
    }

    renderPeriodInsights(run.periods ?? []);
    renderPeriodTable(run.periods ?? []);
    document.querySelector("#run-json").textContent = JSON.stringify(run, null, 2);
    panel.hidden = false;
    historyDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });

    if (run.hasTradeDetails) {
        loadDetailedRunData(run);
    }
}

function renderExperimentDetail(detail) {
    currentExperimentDetail = detail;
    selectedHistoryRunId = null;
    comparisonRunIds = new Set();
    runSort = { key: "returnPercent", direction: "desc" };
    clearRunFilters();
    updateComparisonControls();

    const experiment = detail.experiment;
    const market = experiment.market;
    const completedReturns = detail.runs
        .map((run) => run.summary?.returnPercent)
        .filter((value) => Number.isFinite(value));
    const bestReturn = completedReturns.length
        ? Math.max(...completedReturns)
        : null;

    document.querySelector("#detail-title").textContent =
        experiment.name || experiment.strategy.name;
    document.querySelector("#detail-subtitle").textContent =
        `${experiment.purpose === "DETAILED_RERUN" ? "Detailed validation · " : ""}${market.instrument} · ${market.strategyTimeframe}/${market.executionTimeframe} · ${formatDate(market.from)} – ${formatDate(market.to)}`;

    const status = document.querySelector("#detail-status");
    status.textContent = experiment.status;
    status.dataset.status = experiment.status;
    const experimentError = experiment.error?.message ?? experiment.error?.name ?? null;
    experimentErrorFeedback.textContent = experimentError
        ? `Saved failure: ${experimentError}`
        : "";
    experimentErrorFeedback.hidden = !experimentError;

    renderDashboardCards(
        document.querySelector("#detail-summary-cards"),
        [
            ["Completed runs", `${experiment.completedRuns}/${experiment.validRuns}`],
            ["Purpose", experiment.purpose],
            ["Best return", percentValue(bestReturn)],
            ["Wall time", experiment.wallTimeMs === null ? "-" : `${experiment.wallTimeMs.toLocaleString()} ms`],
            ["Dataset rows", experiment.datasetRows],
            ["Candle evaluations", experiment.candleEvaluations],
            ["D1 rows read", experiment.d1.rowsRead],
            ["Created", formatDateTime(experiment.createdAt)],
            ["Version", experiment.applicationVersion],
        ]
    );

    document.querySelector("#detail-config-output").textContent =
        JSON.stringify(experiment.config, null, 2);
    document.querySelector("#run-detail-panel").hidden = true;
    detailedDataPanel.hidden = true;
    validationComparisonPanel.hidden = true;
    currentDetailedRunData = null;
    comparisonPanel.hidden = true;
    setDetailTabEnabled("analysis", false);
    setDetailTabEnabled("validation", false);
    validationTabEmpty.hidden = false;
    setDetailTab("runs");
    renderRunsTable();

    if (experiment.purpose === "DETAILED_RERUN" && detail.runs.length === 1) {
        renderRunDetail(detail.runs[0]);
    }
}

async function loadExperimentDetail(experimentId) {
    historyStatus.textContent = "Loading experiment…";

    try {
        const response = await fetch(`/api/experiments/${encodeURIComponent(experimentId)}`);
        const body = await response.json();

        if (!response.ok) {
            throw new Error(body.error ?? "Unable to load experiment");
        }

        renderExperimentDetail(body);
        historyListPanel.hidden = true;
        historyDetailPanel.hidden = false;
    } catch (error) {
        historyStatus.textContent = `Unable to open experiment: ${error.message}`;
    }
}

for (const button of viewChoices) {
    button.addEventListener("click", () => setWorkspaceView(button.dataset.viewChoice));
}

for (const button of detailTabButtons) {
    button.addEventListener("click", () => setDetailTab(button.dataset.detailTab));
}

refreshHistoryButton.addEventListener("click", () => {
    historyLoaded = false;
    loadExperimentHistory({ reset: true });
});

experimentFilterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    historyLoaded = false;
    loadExperimentHistory({ reset: true });
});

clearExperimentFiltersButton.addEventListener("click", () => {
    clearExperimentFilters();
    historyLoaded = false;
    loadExperimentHistory({ reset: true });
});

loadMoreExperimentsButton.addEventListener("click", () => {
    loadExperimentHistory({ reset: false });
});

backToHistoryButton.addEventListener("click", () => {
    historyDetailPanel.hidden = true;
    historyListPanel.hidden = false;
    currentExperimentDetail = null;
    selectedHistoryRunId = null;
    comparisonRunIds = new Set();

    if (!historyLoaded) {
        loadExperimentHistory({ reset: true });
    }
});

const backToTopButton = document.querySelector("#back-to-top-button");

function updateBackToTopVisibility() {
    backToTopButton.hidden = window.scrollY < 500;
}

window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
backToTopButton.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});
updateBackToTopVisibility();

for (const control of runFilterControls) {
    control.addEventListener(control.tagName === "SELECT" ? "change" : "input", () => {
        renderRunsTable();
    });
}

clearRunFiltersButton.addEventListener("click", () => {
    clearRunFilters();
    renderRunsTable();
});

clearComparisonButton.addEventListener("click", () => {
    comparisonRunIds = new Set();
    comparisonPanel.hidden = true;
    updateComparisonControls();
    renderRunsTable();
});

compareRunsButton.addEventListener("click", renderComparison);
closeComparisonButton.addEventListener("click", () => {
    comparisonPanel.hidden = true;
});

function selectedSavedRun() {
    return currentExperimentDetail?.runs?.find(
        (run) => run.id === selectedHistoryRunId
    ) ?? null;
}

function saveRunAsStrategyDefaults(run) {
    const experiment = currentExperimentDetail?.experiment;

    if (!experiment || !run) {
        return false;
    }

    const current = readResearchDefaults();
    const base = Object.fromEntries(
        Object.entries(run.strategyConfig ?? {}).map(([name, value]) => [name, String(value)])
    );
    const next = {
        global: current.global ?? {},
        strategies: {
            ...(current.strategies ?? {}),
            [experiment.strategy.id]: { base, sweep: {} },
        },
    };

    try {
        window.localStorage.setItem(RESEARCH_DEFAULTS_STORAGE_KEY, JSON.stringify(next));
        detailedRerunStatus.textContent =
            `Run ${run.runNumber} is now the browser default for ${experiment.strategy.name}.`;
        return true;
    } catch {
        detailedRerunStatus.textContent = "This browser did not allow the strategy defaults to be saved.";
        return false;
    }
}

function toLocalInputValue(value) {
    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
        return "";
    }

    const localTime = date.getTime() - date.getTimezoneOffset() * 60_000;
    return new Date(localTime).toISOString().slice(0, 16);
}

function loadRunIntoExperimentForm(run) {
    const experiment = currentExperimentDetail?.experiment;
    const strategy = strategies.find((item) => item.id === experiment?.strategy?.id);

    if (!experiment || !run || !strategy) {
        detailedRerunFeedback.textContent =
            "This saved run uses a strategy that is not currently available in the form.";
        detailedRerunFeedback.hidden = false;
        return;
    }

    strategySelect.value = strategy.id;
    renderParameters(strategy);
    let loadedParameters = 0;

    for (const control of parameterContainer.querySelectorAll('[data-role="sweep"]')) {
        control.value = "";
    }

    for (const [parameterId, value] of Object.entries(run.strategyConfig ?? {})) {
        const control = document.querySelector(
            `[data-role="base"][data-parameter-id="${parameterId}"]`
        );

        if (control) {
            setControlValue(
                `[data-role="base"][data-parameter-id="${parameterId}"]`,
                value
            );
            loadedParameters++;
        }
    }

    const config = experiment.config ?? {};
    const market = experiment.market ?? {};
    const account = config.account ?? {};
    const execution = config.execution ?? {};

    setControlValue("#instrument", market.instrument);
    setControlValue("#strategy-timeframe", market.strategyTimeframe);
    setControlValue("#execution-timeframe", market.executionTimeframe);
    setControlValue("#from", toLocalInputValue(market.from));
    setControlValue("#to", toLocalInputValue(market.to));
    setControlValue("#initial-capital", account.initialCapital);
    setControlValue("#currency", account.currency);
    setControlValue("#leverage", account.leverage);
    setControlValue("#sizing-type", account.defaultSizing?.type);
    setControlValue("#sizing-value", account.defaultSizing?.value);
    setControlValue("#same-candle-conflict", execution.sameCandleConflict);
    setControlValue(
        "#experiment-name",
        createFollowUpName(experiment.name, strategy.name)
    );

    updateParameterDependencies(strategy);

    plannedConfig = null;
    resultPanel.hidden = true;
    executionPanel.hidden = true;
    requestStatus.textContent =
        `Loaded run ${run.runNumber} with ${loadedParameters} strategy parameters. Review and validate when ready.`;
    setWorkspaceView("research");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

setRunDefaultsButton.addEventListener("click", () => {
    saveRunAsStrategyDefaults(selectedSavedRun());
});

useRunButton.addEventListener("click", () => {
    loadRunIntoExperimentForm(selectedSavedRun());
});

detailedRerunButton.addEventListener("click", async () => {
    const experiment = currentExperimentDetail?.experiment;
    const run = selectedSavedRun();

    if (!experiment || !run || run.status !== "COMPLETED") {
        return;
    }

    if (!window.confirm(
        `Run a detailed validation of run ${run.runNumber}? This executes one cloud backtest and stores its trades and diagnostic events.`
    )) {
        return;
    }

    detailedRerunButton.disabled = true;
    detailedRerunStatus.textContent = "Running detailed cloud validation…";
    detailedRerunFeedback.hidden = true;
    detailedRerunFeedback.textContent = "";

    try {
        const response = await fetch(
            `/api/experiments/${encodeURIComponent(experiment.id)}/runs/${encodeURIComponent(run.id)}/detailed-rerun`,
            { method: "POST" }
        );
        const body = await readJsonResponse(response);

        if (!response.ok) {
            const reasons = body.executionGate?.reasons?.join("; ");
            throw new Error(`${body.error ?? "Detailed validation failed"}${reasons ? `: ${reasons}` : ""}`);
        }

        historyLoaded = false;
        await loadExperimentDetail(body.experimentId);
    } catch (error) {
        historyLoaded = false;
        detailedRerunStatus.textContent = "Detailed validation failed.";
        detailedRerunFeedback.textContent = error.message;
        detailedRerunFeedback.hidden = false;
        detailedRerunFeedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
        detailedRerunButton.disabled = false;
    }
});

function createTradesCsv(trades) {
    const headings = [
        "tradeNumber", "side", "result", "entryTime", "exitTime", "entryPrice",
        "exitPrice", "units", "pnlPips", "pnlAccount", "commissionAccount",
        "mfePips", "maePips", "holdingMinutes", "entryReason", "exitReason", "data",
    ];
    const rows = trades.map((trade) => headings.map((heading) => trade[heading] ?? ""));
    return [headings, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
}

function detailedExportBaseName() {
    const experiment = currentExperimentDetail?.experiment;
    const run = currentDetailedRunData?.run;
    return `${createHistoricalExportBaseName(experiment)}_run-${run?.runNumber ?? "detail"}_validation`;
}

tradeExportCsvButton.addEventListener("click", () => {
    if (!currentDetailedRunData) {
        return;
    }

    downloadBlob(
        `${detailedExportBaseName()}_trades.csv`,
        "text/csv;charset=utf-8",
        `\uFEFF${createTradesCsv(currentDetailedRunData.trades ?? [])}`
    );
});

tradeExportJsonButton.addEventListener("click", () => {
    if (!currentDetailedRunData || !currentExperimentDetail) {
        return;
    }

    const payload = {
        experiment: currentExperimentDetail.experiment,
        sourceRun: currentExperimentDetail.sourceRun,
        ...currentDetailedRunData,
    };
    downloadBlob(
        `${detailedExportBaseName()}.json`,
        "application/json;charset=utf-8",
        JSON.stringify(payload, null, 2)
    );
});

historyExportCsvButton.addEventListener("click", () => {
    if (!currentExperimentDetail) {
        return;
    }

    const filename = `${createHistoricalExportBaseName(currentExperimentDetail.experiment)}.csv`;
    const csv = createHistoricalRunsCsv(currentExperimentDetail);
    downloadBlob(filename, "text/csv;charset=utf-8", `\uFEFF${csv}`);
});

historyExportJsonButton.addEventListener("click", () => {
    if (!currentExperimentDetail) {
        return;
    }

    const filename = `${createHistoricalExportBaseName(currentExperimentDetail.experiment)}.json`;
    const json = createHistoricalJson(currentExperimentDetail);
    downloadBlob(filename, "application/json;charset=utf-8", json);
});
