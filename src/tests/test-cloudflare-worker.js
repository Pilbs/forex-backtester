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
            user: { id: "user-1", email: suppliedIdentity.email },
            workspace: { id: "workspace-1", role: "OWNER" },
        };
    },
    async createExperiment(input) {
        repositoryCalls.push(["createExperiment", input]);
        return { id: "experiment-1" };
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

console.log("Cloudflare research worker test passed.");
