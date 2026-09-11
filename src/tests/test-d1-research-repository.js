import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import { createD1ResearchRepository } from "../cloudflare/d1-research-repository.js";

class BoundStatement {
    constructor(database, sql, values) {
        this.database = database;
        this.sql = sql;
        this.values = values;
    }

    run() {
        const result = this.database.prepare(this.sql).run(...this.values);

        return {
            success: true,
            meta: {
                changes: Number(result.changes),
            },
        };
    }

    first() {
        return this.database.prepare(this.sql).get(...this.values) ?? null;
    }

    all() {
        return {
            success: true,
            results: this.database.prepare(this.sql).all(...this.values),
        };
    }
}

class D1TestDatabase {
    constructor(database) {
        this.database = database;
    }

    prepare(sql) {
        return {
            bind: (...values) => new BoundStatement(this.database, sql, values),
        };
    }

    async batch(statements) {
        return statements.map((statement) => statement.run());
    }
}

const database = new DatabaseSync(":memory:");
const migration = await readFile(
    new URL("../../migrations/research/0001_research_foundation.sql", import.meta.url),
    "utf8"
);

database.exec(migration);

let timestamp = 1_800_000_000_000;
let identifier = 0;

const repository = createD1ResearchRepository({
    db: new D1TestDatabase(database),
    now: () => timestamp++,
    createId: () => `id-${++identifier}`,
});

const identity = {
    provider: "CLOUDFLARE_ACCESS",
    subject: "subject-1",
    email: "danny@example.com",
    displayName: "Danny",
};

const firstContext = await repository.resolveUserContext(identity);
const secondContext = await repository.resolveUserContext(identity);

assert.equal(firstContext.user.id, "user-id-1");
assert.equal(firstContext.workspace.id, "workspace-id-2");
assert.equal(firstContext.workspace.role, "OWNER");
assert.equal(secondContext.user.id, firstContext.user.id);
assert.equal(secondContext.workspace.id, firstContext.workspace.id);

assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users").get().count, 1);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workspaces").get().count, 1);
assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workspace_members").get().count, 1);

const experiment = await repository.createExperiment({
    id: "experiment-1",
    workspaceId: firstContext.workspace.id,
    createdByUserId: firstContext.user.id,
    purpose: "RESEARCH",
    name: "SMA baseline",
    strategy: {
        id: "simple-sma",
        name: "Simple SMA",
        version: 1,
    },
    market: {
        instrument: "EUR_USD",
        strategyTimeframe: "M5",
        executionTimeframe: "M5",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-01T00:00:00.000Z",
    },
    config: {
        strategy: "simple-sma",
        parameterGrid: {
            smaLength: [10, 20],
        },
    },
    requestedRuns: 2,
    validRuns: 2,
    resultSchemaVersion: 5,
    applicationVersion: "test-sha",
});

assert.equal(experiment.status, "PLANNED");
assert.equal(experiment.workspace_id, firstContext.workspace.id);
assert.equal(experiment.requested_runs, 2);

await repository.updateExperimentStatus({
    workspaceId: firstContext.workspace.id,
    experimentId: experiment.id,
    status: "RUNNING",
});

const batch = await repository.createExperimentBatch({
    id: "batch-1",
    experimentId: experiment.id,
    batchNumber: 1,
    firstRunNumber: 1,
    lastRunNumber: 2,
    status: "RUNNING",
    workerRequestId: "request-1",
});

assert.equal(batch.status, "RUNNING");

const completedBatch = await repository.updateExperimentBatch({
    batchId: batch.id,
    status: "COMPLETED",
    execution: {
        wallTimeMs: 500,
        cpuTimeMs: 420,
        d1QueryCount: 2,
        d1RowsRead: 6073,
        d1DurationMs: 15.5,
    },
});

assert.equal(completedBatch.status, "COMPLETED");
assert.equal(completedBatch.cpu_time_ms, 420);
assert.ok(completedBatch.completed_at);

const persistedRun = await repository.saveExperimentRun({
    experimentId: experiment.id,
    run: {
        runId: "run-1",
        runNumber: 1,
        status: "COMPLETED",
        parameterValues: {
            smaLength: 10,
        },
        strategyConfig: {
            smaLength: 10,
        },
        summary: {
            totalTrades: 12,
            wins: 7,
            losses: 5,
            breakeven: 0,
            winRate: 58.3,
            totalPnlPips: 42.5,
            netPnlAccount: 21.25,
            returnPercent: 2.13,
            profitFactor: 1.4,
            maxDrawdownPercent: 3.2,
            expectancyPips: 3.54,
            averageHoldingMinutes: 45,
            averageMfePips: 8.5,
            averageMaePips: 4.1,
        },
        yearlySummary: [],
        monthlySummary: [],
        elapsedMs: 250,
    },
});

assert.equal(persistedRun.run_number, 1);
assert.equal(persistedRun.total_trades, 12);
assert.equal(persistedRun.return_percent, 2.13);

const periodCount = await repository.replaceRunPeriodSummaries({
    runId: persistedRun.id,
    yearly: [{
        year: 2026,
        totalTrades: 12,
        winRate: 58.3,
        totalPnlPips: 42.5,
        netPnlAccount: 21.25,
        returnPercent: 2.13,
        profitFactor: 1.4,
        maxDrawdownPercent: 3.2,
    }],
    monthly: [{
        month: "2026-01",
        totalTrades: 12,
        winRate: 58.3,
        totalPnlPips: 42.5,
        netPnlAccount: 21.25,
        returnPercent: 2.13,
        profitFactor: 1.4,
        maxDrawdownPercent: 3.2,
    }],
});

assert.equal(periodCount, 2);

const tradeCount = await repository.saveRunTrades({
    runId: persistedRun.id,
    trades: [{
        id: "trade-1",
        side: "LONG",
        result: "WIN",
        entryTime: Date.parse("2026-01-02T08:00:00Z"),
        exitTime: Date.parse("2026-01-02T09:00:00Z"),
        entryPrice: 1.1000,
        exitPrice: 1.1020,
        units: 1000,
        pnlPips: 20,
        pnlAccount: 10,
        commissionAccount: 0,
        mfePips: 24,
        maePips: 3,
        holdingMinutes: 60,
        entryReason: "SMA_CLOSE_ABOVE",
        exitReason: "SMA_CLOSE_BELOW",
    }],
});

assert.equal(tradeCount, 1);
assert.equal(
    database.prepare("SELECT has_trade_details FROM experiment_runs WHERE id = ?")
        .get(persistedRun.id).has_trade_details,
    1
);

const completed = await repository.updateExperimentStatus({
    workspaceId: firstContext.workspace.id,
    experimentId: experiment.id,
    status: "COMPLETED",
    totals: {
        completedRuns: 1,
        failedRuns: 0,
    },
    execution: {
        datasetRows: 6072,
        candleEvaluations: 6072,
        wallTimeMs: 500,
        d1QueryCount: 2,
        d1RowsRead: 6073,
        d1DurationMs: 15.5,
    },
});

assert.equal(completed.status, "COMPLETED");
assert.equal(completed.completed_runs, 1);
assert.equal(completed.candle_evaluations, 6072);
assert.ok(completed.started_at);
assert.ok(completed.completed_at);

const experiments = await repository.listExperiments({
    workspaceId: firstContext.workspace.id,
});

assert.equal(experiments.length, 1);
assert.equal(experiments[0].id, experiment.id);
assert.equal(experiments[0].best_return_percent, 2.13);

const filteredExperiments = await repository.listExperiments({
    workspaceId: firstContext.workspace.id,
    filters: {
        status: "COMPLETED",
        strategy: "simple-sma",
        instrument: "EUR_USD",
        timeframe: "M5",
        minimumCompletedRuns: 1,
        minimumBestReturn: 2,
        createdFrom: experiment.created_at - 1,
        createdTo: completed.completed_at + 1,
        search: "baseline",
    },
    sort: "BEST_RETURN",
});

assert.equal(filteredExperiments.length, 1);
assert.equal(filteredExperiments[0].id, experiment.id);

assert.deepEqual(
    await repository.listExperiments({
        workspaceId: firstContext.workspace.id,
        filters: { minimumBestReturn: 3 },
    }),
    []
);

assert.deepEqual(
    await repository.listExperiments({
        workspaceId: firstContext.workspace.id,
        filters: { search: "%" },
    }),
    []
);

await assert.rejects(
    repository.listExperiments({
        workspaceId: firstContext.workspace.id,
        sort: "DROP_TABLE",
    }),
    /Unsupported experiment sort/
);

const detail = await repository.getExperimentDetail({
    workspaceId: firstContext.workspace.id,
    experimentId: experiment.id,
});

assert.equal(detail.experiment.id, experiment.id);
assert.equal(detail.runs.length, 1);
assert.equal(detail.runs[0].id, persistedRun.id);
assert.equal(detail.periodSummaries.length, 2);
assert.deepEqual(
    detail.periodSummaries.map((period) => period.period_type),
    ["MONTH", "YEAR"]
);

const inaccessibleDetail = await repository.getExperimentDetail({
    workspaceId: "another-workspace",
    experimentId: experiment.id,
});

assert.equal(inaccessibleDetail, null);

await assert.rejects(
    repository.createExperiment({
        workspaceId: "another-workspace",
        createdByUserId: firstContext.user.id,
    }),
    /not a member/
);

database.close();

console.log("D1 research repository test passed.");
