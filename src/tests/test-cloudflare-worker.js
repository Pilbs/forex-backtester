import assert from "node:assert/strict";

import { handleRequest } from "../cloudflare/worker.js";

const identity = {
    provider: "CLOUDFLARE_ACCESS",
    subject: "access-user-123",
    email: "danny@example.com",
    displayName: "Danny",
};

const authenticatedDependencies = {
    resolveIdentity: async (request) => {
        assert.equal(
            request.headers.get("Cf-Access-Jwt-Assertion"),
            "signed-token"
        );

        return identity;
    },
};

function apiRequest(path, init = {}) {
    return new Request(`https://example.test${path}`, {
        ...init,
        headers: {
            "Cf-Access-Jwt-Assertion": "signed-token",
            ...init.headers,
        },
    });
}

async function readJson(response) {
    return JSON.parse(await response.text());
}

function createConfig() {
    return {
        name: "ORB validation baseline",
        strategy: "orb",
        market: {
            instrument: "EUR_USD",
            strategyTimeframe: "M5",
            executionTimeframe: "M5",
            from: "2026-08-01T00:00:00Z",
            to: "2026-09-01T00:00:00Z",
        },
        account: {
            initialCapital: 500,
            currency: "USD",
            leverage: 30,
            positionMode: "HEDGING",
            defaultSizing: {
                type: "CASH",
                value: 300,
            },
        },
        execution: {
            sameCandleConflict: "STOP_FIRST",
            closeOpenTradesAtEnd: true,
        },
        strategyConfig: {
            orbStartHour: 8,
            orbStartMinute: 15,
            orbDurationMinutes: 60,
            timezoneMode: "EXCHANGE",
            atrLength: 12,
            stopLossMode: "PIPS",
            stopLossValue: 10,
            takeProfitMode: "PIPS",
            takeProfitValue: 20,
        },
        parameterGrid: {
            breakoutCondition: ["CLOSE", "WICK"],
            requiredRetests: [0, 1],
        },
        policy: {
            warningRunCount: 4,
            maximumRunCount: 4,
        },
    };
}

const healthResponse = await handleRequest(
    apiRequest("/api/health"),
    {},
    authenticatedDependencies
);
const health = await readJson(healthResponse);

assert.equal(healthResponse.status, 200);
assert.equal(health.ok, true);
assert.equal(health.executionEnabled, true);
assert.equal(health.executionMode, "COMMISSIONING");
assert.equal(health.d1Bound, false);
assert.equal(health.researchD1Bound, false);

const strategiesResponse = await handleRequest(
    apiRequest("/api/strategies"),
    {},
    authenticatedDependencies
);
const strategies = await readJson(strategiesResponse);

assert.equal(strategiesResponse.status, 200);
assert.ok(strategies.strategies.some((strategy) => strategy.id === "orb"));

const orbMetadata = strategies.strategies.find((strategy) => strategy.id === "orb");
assert.ok(orbMetadata.parameters.some((parameter) => parameter.id === "breakoutCondition"));
assert.ok(!orbMetadata.parameters.some((parameter) => parameter.id === "entryMode"));

const config = createConfig();
const planResponse = await handleRequest(
    apiRequest("/api/plan", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(config),
    }),
    {},
    authenticatedDependencies
);
const planned = await readJson(planResponse);

assert.equal(planResponse.status, 200);
assert.equal(planned.plan.research.requestedCombinations, 4);
assert.equal(planned.plan.research.validCombinations, 4);
assert.equal(planned.plan.allowed, true);
assert.equal(planned.executionGate.allowed, true);
assert.ok(planned.usageEstimate.estimatedDatasetRows > 0);

const executionWithoutD1 = await handleRequest(
    apiRequest("/api/experiments", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(config),
    }),
    {},
    authenticatedDependencies
);
const missingD1 = await readJson(executionWithoutD1);

assert.equal(executionWithoutD1.status, 503);
assert.match(missingD1.error, /FOREX_DB/);

const blockedConfig = createConfig();
blockedConfig.market.executionTimeframe = "M1";
const blockedResponse = await handleRequest(
    apiRequest("/api/experiments", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(blockedConfig),
    }),
    {},
    authenticatedDependencies
);
const blocked = await readJson(blockedResponse);

assert.equal(blockedResponse.status, 422);
assert.equal(blocked.executionGate.allowed, false);

const missingResponse = await handleRequest(
    apiRequest("/api/missing"),
    {},
    authenticatedDependencies
);
assert.equal(missingResponse.status, 404);

const unauthenticatedResponse = await handleRequest(
    new Request("https://example.test/api/health")
);
assert.equal(unauthenticatedResponse.status, 401);

const repositoryCalls = [];
const repository = {
    async resolveUserContext(suppliedIdentity) {
        repositoryCalls.push(["resolveUserContext", suppliedIdentity]);
        return {
            user: {
                id: "user-1",
                email: suppliedIdentity.email,
                account_role: "OWNER",
            },
            workspace: { id: "workspace-1", role: "OWNER" },
        };
    },
    async createExperiment(input) {
        repositoryCalls.push(["createExperiment", input]);
        return { id: input.purpose === "DETAILED_RERUN" ? "detailed-experiment-1" : "experiment-1" };
    },
    async updateExperimentStatus(input) {
        repositoryCalls.push(["updateExperimentStatus", input]);
        return input;
    },
    async createExperimentBatch(input) {
        repositoryCalls.push(["createExperimentBatch", input]);
        return { id: "batch-1" };
    },
    async updateExperimentBatch(input) {
        repositoryCalls.push(["updateExperimentBatch", input]);
        return input;
    },
    async saveExperimentRun(input) {
        repositoryCalls.push(["saveExperimentRun", input]);
        return { id: input.run.runId };
    },
    async replaceRunPeriodSummaries(input) {
        repositoryCalls.push(["replaceRunPeriodSummaries", input]);
        return input.yearly.length + input.monthly.length;
    },
    async saveRunTrades(input) {
        repositoryCalls.push(["saveRunTrades", input]);
        return input.trades.length;
    },
    async saveRunDiagnosticEvents(input) {
        repositoryCalls.push(["saveRunDiagnosticEvents", input]);
        return input.events.length;
    },
    async getExperimentRun(input) {
        repositoryCalls.push(["getExperimentRun", input]);

        if (input.runId === "missing") {
            return null;
        }

        return { experiment: storedExperiment, run: storedRun };
    },
    async getRunDetails(input) {
        repositoryCalls.push(["getRunDetails", input]);

        if (input.runId === "missing") {
            return null;
        }

        return {
            run: { ...storedRun, has_trade_details: 1 },
            trades: [storedTrade],
            diagnosticEvents: [storedDiagnosticEvent],
        };
    },
    async listExperiments(input) {
        repositoryCalls.push(["listExperiments", input]);

        if (input.limit === 3) {
            return [
                storedExperiment,
                { ...storedExperiment, id: "experiment-history-2" },
                { ...storedExperiment, id: "experiment-history-3" },
            ];
        }

        return [storedExperiment];
    },
    async getExperimentDetail(input) {
        repositoryCalls.push(["getExperimentDetail", input]);

        if (input.experimentId === "missing") {
            return null;
        }

        return {
            experiment: storedExperiment,
            runs: [storedRun],
            periodSummaries: [storedPeriod],
            sourceRun: null,
        };
    },
};

const storedExperiment = {
    id: "experiment-history-1",
    workspace_id: "workspace-1",
    purpose: "RESEARCH",
    status: "COMPLETED",
    name: "ORB baseline",
    strategy_id: "orb",
    strategy_name: "Opening Range Breakout",
    strategy_version: 1,
    instrument: "EUR_USD",
    strategy_timeframe: "M5",
    execution_timeframe: "M5",
    from_time: "2026-08-01T00:00:00.000Z",
    to_time: "2026-09-01T00:00:00.000Z",
    config_json: JSON.stringify(config),
    requested_runs: 4,
    valid_runs: 4,
    completed_runs: 4,
    failed_runs: 0,
    dataset_rows: 100,
    candle_evaluations: 400,
    wall_time_ms: 800,
    d1_query_count: 1,
    d1_rows_read: 100,
    d1_duration_ms: 2.5,
    best_return_percent: 2.5,
    best_profit_factor: 1.8,
    lowest_drawdown_percent: 0.9,
    application_version: "test-sha",
    result_schema_version: 5,
    error_json: null,
    created_at: 1_800_000_000_000,
    started_at: 1_800_000_000_001,
    completed_at: 1_800_000_000_800,
    updated_at: 1_800_000_000_800,
};

const storedRun = {
    id: "stored-run-1",
    run_number: 1,
    status: "COMPLETED",
    parameter_values_json: JSON.stringify({ breakoutCondition: "CLOSE" }),
    strategy_config_json: JSON.stringify(config.strategyConfig),
    summary_json: JSON.stringify({
        totalTrades: 2,
        winRate: 50,
        returnPercent: 2.5,
    }),
    detail_counts_json: JSON.stringify({ signals: 2 }),
    rejection_reasons_json: JSON.stringify({}),
    elapsed_ms: 20,
    error_json: null,
    has_trade_details: 0,
    created_at: 1_800_000_000_010,
    updated_at: 1_800_000_000_030,
};

const storedPeriod = {
    run_id: "stored-run-1",
    period_type: "MONTH",
    period_key: "2026-08",
    summary_json: JSON.stringify({ totalTrades: 2, returnPercent: 2.5 }),
};

const storedTrade = {
    id: "trade-1",
    run_id: "stored-run-1",
    trade_number: 1,
    side: "LONG",
    result: "WIN",
    entry_time: Date.parse("2026-08-03T08:00:00Z"),
    exit_time: Date.parse("2026-08-03T09:00:00Z"),
    entry_price: 1.1,
    exit_price: 1.102,
    units: 1000,
    pnl_pips: 20,
    pnl_account: 10,
    commission_account: 0,
    mfe_pips: 24,
    mae_pips: 3,
    holding_minutes: 60,
    entry_reason: "BREAKOUT",
    exit_reason: "TAKE_PROFIT",
    trade_json: JSON.stringify({ id: "trade-1", side: "LONG" }),
};

const storedDiagnosticEvent = {
    id: "stored-run-1-event-1",
    event_number: 1,
    event_type: "SIGNAL",
    event_time: Date.parse("2026-08-03T07:55:00Z"),
    reason: "BREAKOUT",
    event_json: JSON.stringify({ action: "ENTER", side: "LONG" }),
};

const completedRun = {
    runId: "run-1",
    runNumber: 1,
    status: "COMPLETED",
    parameterValues: { breakoutCondition: "CLOSE" },
    strategyConfig: config.strategyConfig,
    summary: {
        totalTrades: 2,
        wins: 1,
        losses: 1,
        returnPercent: 1.5,
    },
    yearlySummary: [{ year: 2026, totalTrades: 2 }],
    monthlySummary: [{ month: "2026-08", totalTrades: 2 }],
    rejectionReasons: {},
    trades: [storedTrade],
    signals: [{ time: storedDiagnosticEvent.event_time, reason: "BREAKOUT" }],
    orders: [{ createdTime: storedTrade.entry_time, reason: "BREAKOUT" }],
    fills: [{ time: storedTrade.entry_time, price: 1.1 }],
    rejectedOrders: [],
    riskEvents: [],
    elapsedMs: 12,
};

const persistedResponse = await handleRequest(
    apiRequest("/api/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
    }),
    {
        FOREX_DB: { prepare() {} },
        RESEARCH_DB: { prepare() {} },
        APP_VERSION: "test-sha",
    },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
        runResearchJob: async (suppliedConfig, options) => {
            assert.deepEqual(suppliedConfig, config);
            assert.equal(options.experimentId, "experiment-1");
            assert.equal(options.includeTrades, false);
            assert.equal(options.includeRunDetails, false);
            await options.onProgress({ currentRun: completedRun });

            return {
                schemaVersion: 5,
                experiment: {
                    id: "experiment-1",
                    strategy: { id: "orb", name: "Opening Range Breakout", version: 1 },
                    backtest: config.market,
                    parameterGrid: config.parameterGrid,
                    requestedCombinations: 4,
                    validCombinations: 4,
                    invalidCombinations: [],
                    dataset: {
                        strategyCandleCount: 100,
                        executionCandleCount: 100,
                    },
                    datasetLoadElapsedMs: 3,
                    elapsedMs: 12,
                },
                totals: { completedRuns: 1, failedRuns: 0 },
                runs: [completedRun],
            };
        },
    }
);
const persisted = await readJson(persistedResponse);

assert.equal(persistedResponse.status, 200);
assert.equal(persisted.experimentId, "experiment-1");
assert.equal(
    repositoryCalls.find(([name]) => name === "createExperiment")[1]
        .createdByUserId,
    "user-1"
);
assert.equal(
    repositoryCalls.find(([name]) => name === "createExperiment")[1].name,
    "ORB validation baseline"
);
assert.deepEqual(
    repositoryCalls
        .filter(([name]) => name === "updateExperimentStatus")
        .map(([, input]) => input.status),
    ["RUNNING", "COMPLETED"]
);
assert.equal(
    repositoryCalls
        .filter(([name]) => name === "updateExperimentStatus")
        .at(-1)[1].execution.candleEvaluations,
    100
);
assert.deepEqual(
    repositoryCalls
        .filter(([name]) => name === "updateExperimentBatch")
        .map(([, input]) => input.status),
    ["COMPLETED"]
);
assert.equal(
    repositoryCalls.find(([name]) => name === "replaceRunPeriodSummaries")[1]
        .monthly[0].month,
    "2026-08"
);

const meResponse = await handleRequest(
    apiRequest("/api/me"),
    { RESEARCH_DB: { prepare() {} } },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);
const me = await readJson(meResponse);

assert.equal(meResponse.status, 200);
assert.equal(me.user.id, "user-1");
assert.equal(me.workspace.id, "workspace-1");

const historyResponse = await handleRequest(
    apiRequest(
        "/api/experiments?limit=20&offset=5"
        + "&status=completed&strategy=orb&instrument=eur_usd&timeframe=m5"
        + "&minimumCompletedRuns=2&minimumBestReturn=1.5"
        + "&createdFrom=2026-08-01T00%3A00%3A00Z"
        + "&createdTo=2026-09-01T00%3A00%3A00Z"
        + "&search=baseline&sort=best_return"
    ),
    { RESEARCH_DB: { prepare() {} } },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);
const history = await readJson(historyResponse);

assert.equal(historyResponse.status, 200);
assert.equal(history.workspace.id, "workspace-1");
assert.equal(history.experiments.length, 1);
assert.equal(history.experiments[0].strategy.id, "orb");
assert.equal(history.experiments[0].performance.bestReturnPercent, 2.5);
assert.deepEqual(history.pagination, {
    limit: 20,
    offset: 5,
    returned: 1,
    hasMore: false,
    nextOffset: null,
});
assert.deepEqual(
    repositoryCalls.find(([name]) => name === "listExperiments")[1],
    {
        workspaceId: "workspace-1",
        limit: 21,
        offset: 5,
        filters: {
            status: "COMPLETED",
            strategy: "orb",
            instrument: "EUR_USD",
            timeframe: "M5",
            minimumCompletedRuns: 2,
            minimumBestReturn: 1.5,
            createdFrom: Date.parse("2026-08-01T00:00:00Z"),
            createdTo: Date.parse("2026-09-01T00:00:00Z"),
            search: "baseline",
        },
        sort: "BEST_RETURN",
    }
);

const pagedHistoryResponse = await handleRequest(
    apiRequest("/api/experiments?limit=2"),
    { RESEARCH_DB: { prepare() {} } },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);
const pagedHistory = await readJson(pagedHistoryResponse);

assert.equal(pagedHistory.experiments.length, 2);
assert.equal(pagedHistory.pagination.hasMore, true);
assert.equal(pagedHistory.pagination.nextOffset, 2);

const invalidHistoryLimit = await handleRequest(
    apiRequest("/api/experiments?limit=101"),
    { RESEARCH_DB: { prepare() {} } },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);
assert.equal(invalidHistoryLimit.status, 400);

const invalidHistoryDates = await handleRequest(
    apiRequest(
        "/api/experiments?createdFrom=2026-09-01T00%3A00%3A00Z"
        + "&createdTo=2026-08-01T00%3A00%3A00Z"
    ),
    { RESEARCH_DB: { prepare() {} } },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);
assert.equal(invalidHistoryDates.status, 400);

const detailResponse = await handleRequest(
    apiRequest("/api/experiments/experiment-history-1"),
    { RESEARCH_DB: { prepare() {} } },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);
const detail = await readJson(detailResponse);

assert.equal(detailResponse.status, 200);
assert.equal(detail.experiment.id, "experiment-history-1");
assert.equal(detail.experiment.config.strategy, "orb");
assert.equal(detail.runs.length, 1);
assert.equal(detail.runs[0].summary.returnPercent, 2.5);
assert.equal(detail.runs[0].periods[0].key, "2026-08");
assert.deepEqual(
    repositoryCalls.find(([name]) => name === "getExperimentDetail")[1],
    { workspaceId: "workspace-1", experimentId: "experiment-history-1" }
);

const detailedRerunResponse = await handleRequest(
    apiRequest("/api/experiments/experiment-history-1/runs/stored-run-1/detailed-rerun", {
        method: "POST",
    }),
    {
        FOREX_DB: { prepare() {} },
        RESEARCH_DB: { prepare() {} },
        APP_VERSION: "validation-sha",
    },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
        runResearchJob: async (suppliedConfig, options) => {
            assert.equal(suppliedConfig.strategy, "orb");
            assert.deepEqual(suppliedConfig.strategyConfig, config.strategyConfig);
            assert.deepEqual(suppliedConfig.parameterGrid, {});
            assert.equal(options.experimentId, "detailed-experiment-1");
            assert.equal(options.includeTrades, true);
            assert.equal(options.includeRunDetails, true);
            assert.equal(options.captureEquityCurve, false);
            assert.equal(options.stopOnError, true);
            await options.onProgress({ currentRun: completedRun });

            return {
                schemaVersion: 5,
                experiment: {
                    id: "detailed-experiment-1",
                    strategy: { id: "orb", name: "Opening Range Breakout", version: 1 },
                    backtest: config.market,
                    dataset: {
                        strategyCandleCount: 100,
                        executionCandleCount: 100,
                    },
                },
                totals: { completedRuns: 1, failedRuns: 0 },
                runs: [completedRun],
            };
        },
    }
);
const detailedRerun = await readJson(detailedRerunResponse);

assert.equal(detailedRerunResponse.status, 200);
assert.equal(detailedRerun.experimentId, "detailed-experiment-1");
assert.equal(detailedRerun.sourceRunId, "stored-run-1");
assert.equal(detailedRerun.tradeCount, 1);
assert.equal(detailedRerun.diagnosticEventCount, 3);
assert.equal(
    repositoryCalls.find(([, input]) => input?.purpose === "DETAILED_RERUN")[1]
        .parentExperimentId,
    "experiment-history-1"
);
assert.equal(
    repositoryCalls.filter(([name]) => name === "saveRunTrades").at(-1)[1].trades.length,
    1
);
assert.equal(
    repositoryCalls.filter(([name]) => name === "saveRunDiagnosticEvents").at(-1)[1].events.length,
    3
);

const runDetailsResponse = await handleRequest(
    apiRequest("/api/runs/stored-run-1/details"),
    { RESEARCH_DB: { prepare() {} } },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);
const runDetails = await readJson(runDetailsResponse);

assert.equal(runDetailsResponse.status, 200);
assert.equal(runDetails.trades[0].entryTime, "2026-08-03T08:00:00.000Z");
assert.equal(runDetails.trades[0].mfePips, 24);
assert.equal(runDetails.diagnosticEvents[0].type, "SIGNAL");

const missingDetailedRerun = await handleRequest(
    apiRequest("/api/experiments/experiment-history-1/runs/missing/detailed-rerun", {
        method: "POST",
    }),
    {
        FOREX_DB: { prepare() {} },
        RESEARCH_DB: { prepare() {} },
    },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);
assert.equal(missingDetailedRerun.status, 404);

const hiddenExperimentResponse = await handleRequest(
    apiRequest("/api/experiments/missing"),
    { RESEARCH_DB: { prepare() {} } },
    {
        ...authenticatedDependencies,
        createResearchRepository: () => repository,
    }
);

assert.equal(hiddenExperimentResponse.status, 404);

console.log("Cloudflare research worker test passed.");
