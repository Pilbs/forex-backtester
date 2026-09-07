const strategySelect = document.querySelector("#strategy");
const parameterContainer = document.querySelector("#strategy-parameters");
const form = document.querySelector("#research-form");
const resultPanel = document.querySelector("#result-panel");
const executionPanel = document.querySelector("#execution-panel");
const errorPanel = document.querySelector("#error-panel");
const requestStatus = document.querySelector("#request-status");
const executionStatus = document.querySelector("#execution-status");
const runButton = document.querySelector("#run-button");

let strategies = [];
let plannedConfig = null;

let executionTimer = null;
let executionStartedAt = null;

function formatElapsed(ms) {
    return `${(ms / 1000).toFixed(1)} s`;
}

function startExecutionTimer() {
    executionStartedAt = performance.now();
    executionStatus.textContent = "Running... 0.0 s";

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

function renderParameters(strategy) {
    parameterContainer.replaceChildren();

    for (const parameter of strategy.parameters) {
        const row = document.createElement("div");
        row.className = "parameter-row";

        const description = parameter.description
            ? `<span class="parameter-description">${parameter.description}</span>`
            : "";

        const label = document.createElement("div");
        label.className = "parameter-name";
        label.innerHTML = `<strong>${parameter.label}</strong>${description}`;

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

        if (sweepControl?.value.trim()) {
            parameterGrid[parameter.id] = sweepControl.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
                .map((value) => parseTypedValue(value, parameter));
        }
    }

    return {
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
        ? "Within commissioning limits. Running will read D1 and execute the real backtesting engine in Cloudflare."
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

async function loadStrategies() {
    const response = await fetch("/api/strategies");
    const body = await response.json();

    if (!response.ok) {
        throw new Error(body.error ?? "Unable to load strategies");
    }

    strategies = body.strategies;
    strategySelect.replaceChildren();

    for (const strategy of strategies) {
        const option = document.createElement("option");
        option.value = strategy.id;
        option.textContent = strategy.name;
        strategySelect.append(option);
    }

    renderParameters(strategies[0]);
}

strategySelect.addEventListener("change", () => {
    renderParameters(selectedStrategy());
});

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
