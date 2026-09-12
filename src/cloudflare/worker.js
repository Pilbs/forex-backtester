import { planResearch, runResearch } from "../research/run-research.js";
import { listStrategyMetadata } from "../strategies/strategy-registry.js";
import {
    AuthenticationError,
    resolveCloudflareAccessIdentity,
} from "../auth/cloudflare-access-identity.js";
import {
    createCloudflareDatasetLoader,
    createD1UsageTracker,
} from "./d1-dataset-loader.js";
import { createD1ResearchRepository } from "./d1-research-repository.js";
import {
    assessResearchExecution,
    getAccountUsageLimits,
} from "./research-execution-gate.js";
import { estimateResearchUsage } from "./research-usage-estimate.js";


function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}

function parseStoredJson(value, fallback = null) {
    if (typeof value !== "string") {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function toIsoTimestamp(value) {
    return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function serializeStoredExperiment(row, { includeConfig = false } = {}) {
    const experiment = {
        id: row.id,
        workspaceId: row.workspace_id,
        parentExperimentId: row.parent_experiment_id ?? null,
        sourceRunId: row.source_run_id ?? null,
        purpose: row.purpose,
        status: row.status,
        name: row.name,
        strategy: {
            id: row.strategy_id,
            name: row.strategy_name,
            version: row.strategy_version,
        },
        market: {
            instrument: row.instrument,
            strategyTimeframe: row.strategy_timeframe,
            executionTimeframe: row.execution_timeframe,
            from: row.from_time,
            to: row.to_time,
        },
        requestedRuns: row.requested_runs,
        validRuns: row.valid_runs,
        completedRuns: row.completed_runs,
        failedRuns: row.failed_runs,
        datasetRows: row.dataset_rows,
        candleEvaluations: row.candle_evaluations,
        wallTimeMs: row.wall_time_ms,
        d1: {
            queryCount: row.d1_query_count,
            rowsRead: row.d1_rows_read,
            durationMs: row.d1_duration_ms,
        },
        performance: {
            bestReturnPercent: row.best_return_percent ?? null,
            bestProfitFactor: row.best_profit_factor ?? null,
            lowestDrawdownPercent: row.lowest_drawdown_percent ?? null,
        },
        applicationVersion: row.application_version,
        resultSchemaVersion: row.result_schema_version,
        error: parseStoredJson(row.error_json),
        createdAt: toIsoTimestamp(row.created_at),
        startedAt: toIsoTimestamp(row.started_at),
        completedAt: toIsoTimestamp(row.completed_at),
        updatedAt: toIsoTimestamp(row.updated_at),
    };

    if (includeConfig) {
        experiment.config = parseStoredJson(row.config_json, {});
    }

    return experiment;
}

function serializeStoredRun(row, periods = []) {
    return {
        id: row.id,
        runNumber: row.run_number,
        status: row.status,
        parameterValues: parseStoredJson(row.parameter_values_json, {}),
        strategyConfig: parseStoredJson(row.strategy_config_json, {}),
        summary: parseStoredJson(row.summary_json),
        detailCounts: parseStoredJson(row.detail_counts_json, {}),
        rejectionReasons: parseStoredJson(row.rejection_reasons_json, {}),
        elapsedMs: row.elapsed_ms,
        error: parseStoredJson(row.error_json),
        hasTradeDetails: row.has_trade_details === 1,
        periods: periods.map((period) => ({
            type: period.period_type,
            key: period.period_key,
            summary: parseStoredJson(period.summary_json, {}),
        })),
        createdAt: toIsoTimestamp(row.created_at),
        updatedAt: toIsoTimestamp(row.updated_at),
    };
}

function serializeStoredTrade(row) {
    return {
        id: row.id,
        tradeNumber: row.trade_number,
        side: row.side,
        result: row.result,
        entryTime: toIsoTimestamp(row.entry_time),
        exitTime: toIsoTimestamp(row.exit_time),
        entryPrice: row.entry_price,
        exitPrice: row.exit_price,
        units: row.units,
        pnlPips: row.pnl_pips,
        pnlAccount: row.pnl_account,
        commissionAccount: row.commission_account,
        mfePips: row.mfe_pips,
        maePips: row.mae_pips,
        holdingMinutes: row.holding_minutes,
        entryReason: row.entry_reason,
        exitReason: row.exit_reason,
        data: parseStoredJson(row.trade_json, {}),
    };
}

function serializeStoredDiagnosticEvent(row) {
    return {
        id: row.id,
        eventNumber: row.event_number,
        type: row.event_type,
        time: toIsoTimestamp(row.event_time),
        reason: row.reason,
        data: parseStoredJson(row.event_json, {}),
    };
}

function parsePaginationInteger(value, fallback, name) {
    if (value === null) {
        return fallback;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
        throw new Error(`${name} must be an integer`);
    }

    return parsed;
}

function parseOptionalQueryText(value, name) {
    if (value === null || value === "") {
        return undefined;
    }

    const text = value.trim();

    if (!text || text.length > 100) {
        throw new Error(`${name} must be between 1 and 100 characters`);
    }

    return text;
}

function parseOptionalQueryNumber(value, name, { integer = false, minimum } = {}) {
    if (value === null || value === "") {
        return undefined;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
        throw new Error(`${name} must be ${integer ? "an integer" : "a number"}`);
    }

    if (minimum !== undefined && parsed < minimum) {
        throw new Error(`${name} must be at least ${minimum}`);
    }

    return parsed;
}

function parseOptionalQueryDate(value, name) {
    if (value === null || value === "") {
        return undefined;
    }

    const parsed = Date.parse(value);

    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a valid date/time`);
    }

    return parsed;
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        throw new Error("Request body must be valid JSON");
    }
}

function summarizePlan(plan) {
    return {
        allowed: plan.allowed,
        warning: plan.warning,
        rejectionReason: plan.rejectionReason,
        strategy: plan.strategy,
        backtest: plan.backtest,
        research: {
            requestedCombinations: plan.research.requestedCombinations,
            validCombinations: plan.research.validCombinations,
            invalidCombinations: plan.research.invalidCombinations,
            policy: plan.research.policy,
        },
    };
}

function summarizeResearchResult(result) {
    return {
        schemaVersion: result.schemaVersion,
        experiment: {
            id: result.experiment.id,
            strategy: result.experiment.strategy,
            backtest: result.experiment.backtest,
            parameterGrid: result.experiment.parameterGrid,
            requestedCombinations: result.experiment.requestedCombinations,
            validCombinations: result.experiment.validCombinations,
            invalidCombinations: result.experiment.invalidCombinations,
            dataset: result.experiment.dataset,
            datasetLoadElapsedMs: result.experiment.datasetLoadElapsedMs,
            elapsedMs: result.experiment.elapsedMs,
        },
        totals: result.totals,
        runs: result.runs.map((run) => ({
            runNumber: run.runNumber,
            status: run.status,
            parameterValues: run.parameterValues,
            strategyConfig: run.strategyConfig,
            summary: run.summary ?? null,
            rejectionReasons: run.rejectionReasons ?? {},
            elapsedMs: run.elapsedMs,
            error: run.error ?? null,
        })),
    };
}

function serializeError(error) {
    return {
        name: error?.name ?? "Error",
        message: error?.message ?? String(error),
    };
}

function datasetRowCount(dataset, backtest) {
    if (!dataset) {
        return null;
    }

    const strategyRows = Number(dataset.strategyCandleCount ?? 0);
    const executionRows = Number(dataset.executionCandleCount ?? 0);

    return backtest?.executionTimeframe === backtest?.strategyTimeframe
        ? strategyRows
        : strategyRows + executionRows;
}

function executionMetrics({ result, usageTracker, wallTimeMs }) {
    const datasetRows = datasetRowCount(
        result?.experiment?.dataset,
        result?.experiment?.backtest
    );
    const completedRuns = result?.totals?.completedRuns ?? 0;
    const failedRuns = result?.totals?.failedRuns ?? 0;

    return {
        datasetRows,
        candleEvaluations: datasetRows === null
            ? null
            : datasetRows * (completedRuns + failedRuns),
        wallTimeMs,
        d1QueryCount: usageTracker.queryCount,
        d1RowsRead: usageTracker.rowsRead,
        d1DurationMs: usageTracker.d1DurationMs,
    };
}

function planExecution(config, accountRole = "OWNER") {
    const plan = planResearch(config);
    const usageEstimate = estimateResearchUsage(config, plan);
    const executionGate = assessResearchExecution(
        config,
        plan,
        usageEstimate,
        accountRole
    );

    return {
        plan,
        usageEstimate,
        executionGate,
    };
}

function diagnosticEventTime(event) {
    const value = event?.decisionTime
        ?? event?.time
        ?? event?.fillTime
        ?? event?.createdTime
        ?? event?.cancelTime
        ?? event?.sourceTime;

    if (Number.isFinite(value)) {
        return value;
    }

    const parsed = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}

function createDiagnosticEvents(run) {
    const groups = [
        ["SIGNAL", run.signals],
        ["ORDER", run.orders],
        ["FILL", run.fills],
        ["REJECTION", run.rejectedOrders],
        ["RISK", run.riskEvents],
    ];
    let sequence = 0;

    return groups.flatMap(([type, items]) => (items ?? []).map((data) => ({
        type,
        time: diagnosticEventTime(data),
        reason: data?.reason ?? data?.rejectionReason ?? (type === "RISK" ? data?.type : null),
        data,
        sequence: sequence++,
    }))).sort((left, right) => {
        if (left.time === null || right.time === null) {
            return left.time === right.time ? left.sequence - right.sequence : left.time === null ? 1 : -1;
        }

        return left.time - right.time || left.sequence - right.sequence;
    }).map(({ sequence: unused, ...event }) => event);
}

function createDetailedRerunConfig(experiment, run) {
    const originalConfig = parseStoredJson(experiment.config_json, {});

    return {
        ...originalConfig,
        name: `${experiment.name ?? experiment.strategy_name} · Run ${run.run_number} validation`,
        strategy: experiment.strategy_id,
        market: {
            ...(originalConfig.market ?? {}),
            instrument: experiment.instrument,
            strategyTimeframe: experiment.strategy_timeframe,
            executionTimeframe: experiment.execution_timeframe,
            from: experiment.from_time,
            to: experiment.to_time,
        },
        strategyConfig: parseStoredJson(run.strategy_config_json, {}),
        parameterGrid: {},
        policy: {
            warningRunCount: 1,
            maximumRunCount: 1,
        },
    };
}

async function executeDetailedRerun({
    source,
    request,
    env,
    userContext,
    repository,
    runResearchJob,
}) {
    if (source.run.status !== "COMPLETED") {
        return jsonResponse({ error: "Only completed runs can be validated" }, 409);
    }

    const config = createDetailedRerunConfig(source.experiment, source.run);
    const { plan, usageEstimate, executionGate } = planExecution(
        config,
        userContext.user.account_role
    );

    if (!executionGate.allowed) {
        return jsonResponse({
            error: "Detailed rerun blocked by cloud commissioning limits",
            plan: summarizePlan(plan),
            usageEstimate,
            executionGate,
        }, 422);
    }

    const usageTracker = createD1UsageTracker();
    const started = performance.now();
    let experiment;
    let batch;
    let tradeCount = 0;
    let diagnosticEventCount = 0;

    try {
        experiment = await repository.createExperiment({
            workspaceId: userContext.workspace.id,
            createdByUserId: userContext.user.id,
            parentExperimentId: source.experiment.id,
            sourceRunId: source.run.id,
            purpose: "DETAILED_RERUN",
            name: config.name,
            strategy: plan.strategy,
            market: plan.backtest,
            config,
            requestedRuns: 1,
            validRuns: 1,
            resultSchemaVersion: 5,
            applicationVersion: env.APP_VERSION ?? null,
        });

        await repository.updateExperimentStatus({
            workspaceId: userContext.workspace.id,
            experimentId: experiment.id,
            status: "RUNNING",
        });

        batch = await repository.createExperimentBatch({
            experimentId: experiment.id,
            batchNumber: 1,
            firstRunNumber: 1,
            lastRunNumber: 1,
            status: "RUNNING",
            workerRequestId: request.headers.get("cf-ray"),
        });

        const result = await runResearchJob(config, {
            experimentId: experiment.id,
            includeTrades: true,
            includeRunDetails: true,
            captureEquityCurve: false,
            stopOnError: true,
            datasetLoader: createCloudflareDatasetLoader({
                db: env.FOREX_DB,
                usageTracker,
            }),
            onProgress: async ({ currentRun }) => {
                const persistedRun = await repository.saveExperimentRun({
                    experimentId: experiment.id,
                    run: { ...currentRun, trades: undefined },
                });

                await repository.replaceRunPeriodSummaries({
                    runId: persistedRun.id,
                    yearly: currentRun.yearlySummary ?? [],
                    monthly: currentRun.monthlySummary ?? [],
                });
                await repository.saveRunTrades({
                    runId: persistedRun.id,
                    trades: currentRun.trades ?? [],
                });
                tradeCount = currentRun.trades?.length ?? 0;
                const diagnosticEvents = createDiagnosticEvents(currentRun);
                await repository.saveRunDiagnosticEvents({
                    runId: persistedRun.id,
                    events: diagnosticEvents,
                });
                diagnosticEventCount = diagnosticEvents.length;
            },
        });
        const wallTimeMs = Math.round(performance.now() - started);
        const metrics = executionMetrics({ result, usageTracker, wallTimeMs });

        await repository.updateExperimentBatch({
            batchId: batch.id,
            status: "COMPLETED",
            execution: metrics,
        });
        await repository.updateExperimentStatus({
            workspaceId: userContext.workspace.id,
            experimentId: experiment.id,
            status: "COMPLETED",
            totals: result.totals,
            execution: metrics,
        });

        return jsonResponse({
            status: "COMPLETED",
            experimentId: experiment.id,
            sourceExperimentId: source.experiment.id,
            sourceRunId: source.run.id,
            tradeCount,
            diagnosticEventCount,
            execution: { mode: "CLOUD", wallTimeMs, d1: usageTracker },
        });
    } catch (error) {
        const serializedError = serializeError(error);
        const wallTimeMs = Math.round(performance.now() - started);
        const failureMetrics = {
            wallTimeMs,
            d1QueryCount: usageTracker.queryCount,
            d1RowsRead: usageTracker.rowsRead,
            d1DurationMs: usageTracker.d1DurationMs,
        };

        if (batch?.id) {
            try {
                await repository.updateExperimentBatch({
                    batchId: batch.id,
                    status: "FAILED",
                    execution: failureMetrics,
                    error: serializedError,
                });
            } catch (persistenceError) {
                console.error("Failed to mark detailed rerun batch as failed", persistenceError);
            }
        }

        if (experiment?.id) {
            try {
                await repository.updateExperimentStatus({
                    workspaceId: userContext.workspace.id,
                    experimentId: experiment.id,
                    status: "FAILED",
                    totals: { completedRuns: 0, failedRuns: 1 },
                    execution: failureMetrics,
                    error: serializedError,
                });
            } catch (persistenceError) {
                console.error("Failed to mark detailed rerun as failed", persistenceError);
            }
        }

        return jsonResponse({
            error: serializedError.message,
            experimentId: experiment?.id ?? null,
        }, 500);
    }
}

async function executeResearch(config, request, env, identity, {
    createResearchRepository,
    runResearchJob,
}) {
    if (!env.FOREX_DB?.prepare) {
        return jsonResponse({
            error: "FOREX_DB D1 binding is unavailable",
        }, 503);
    }

    if (!env.RESEARCH_DB?.prepare) {
        return jsonResponse({
            error: "RESEARCH_DB D1 binding is unavailable",
        }, 503);
    }

    const usageTracker = createD1UsageTracker();
    const started = performance.now();
    const repository = createResearchRepository({ db: env.RESEARCH_DB });
    let userContext;
    let experiment;
    let batch;
    let completedRuns = 0;
    let failedRuns = 0;

    try {
        userContext = await repository.resolveUserContext(identity);
        const { plan, usageEstimate, executionGate } = planExecution(
            config,
            userContext.user.account_role
        );

        if (!executionGate.allowed) {
            return jsonResponse({
                error: "Execution blocked by account usage limits",
                plan: summarizePlan(plan),
                usageEstimate,
                executionGate,
            }, 422);
        }

        experiment = await repository.createExperiment({
            workspaceId: userContext.workspace.id,
            createdByUserId: userContext.user.id,
            purpose: "RESEARCH",
            name: config.name,
            strategy: plan.strategy,
            market: plan.backtest,
            config,
            requestedRuns: plan.research.requestedCombinations,
            validRuns: plan.research.validCombinations,
            resultSchemaVersion: 5,
            applicationVersion: env.APP_VERSION ?? null,
        });

        await repository.updateExperimentStatus({
            workspaceId: userContext.workspace.id,
            experimentId: experiment.id,
            status: "RUNNING",
        });

        batch = await repository.createExperimentBatch({
            experimentId: experiment.id,
            batchNumber: 1,
            firstRunNumber: 1,
            lastRunNumber: plan.research.validCombinations,
            status: "RUNNING",
            workerRequestId: request.headers.get("cf-ray"),
        });

        const result = await runResearchJob(config, {
            experimentId: experiment.id,
            includeTrades: false,
            includeRunDetails: false,
            captureEquityCurve: false,
            stopOnError: false,
            datasetLoader: createCloudflareDatasetLoader({
                db: env.FOREX_DB,
                usageTracker,
            }),
            onProgress: async ({ currentRun }) => {
                if (currentRun.status === "COMPLETED") {
                    completedRuns++;
                } else if (currentRun.status === "FAILED") {
                    failedRuns++;
                }

                const persistedRun = await repository.saveExperimentRun({
                    experimentId: experiment.id,
                    run: currentRun,
                });

                await repository.replaceRunPeriodSummaries({
                    runId: persistedRun.id,
                    yearly: currentRun.yearlySummary ?? [],
                    monthly: currentRun.monthlySummary ?? [],
                });
            },
        });

        const wallTimeMs = Math.round(performance.now() - started);
        const metrics = executionMetrics({ result, usageTracker, wallTimeMs });

        await repository.updateExperimentBatch({
            batchId: batch.id,
            status: "COMPLETED",
            execution: metrics,
        });

        await repository.updateExperimentStatus({
            workspaceId: userContext.workspace.id,
            experimentId: experiment.id,
            status: "COMPLETED",
            totals: result.totals,
            execution: metrics,
        });

        return jsonResponse({
            status: "COMPLETED",
            experimentId: experiment.id,
            execution: {
                mode: "CLOUD",
                wallTimeMs,
                d1: usageTracker,
            },
            usageEstimate,
            executionGate,
            result: summarizeResearchResult(result),
        });
    } catch (error) {
        const serializedError = serializeError(error);
        const wallTimeMs = Math.round(performance.now() - started);
        const failureMetrics = {
            wallTimeMs,
            d1QueryCount: usageTracker.queryCount,
            d1RowsRead: usageTracker.rowsRead,
            d1DurationMs: usageTracker.d1DurationMs,
        };

        if (batch?.id) {
            try {
                await repository.updateExperimentBatch({
                    batchId: batch.id,
                    status: "FAILED",
                    execution: failureMetrics,
                    error: serializedError,
                });
            } catch (persistenceError) {
                console.error("Failed to mark experiment batch as failed", persistenceError);
            }
        }

        if (experiment?.id && userContext?.workspace?.id) {
            try {
                await repository.updateExperimentStatus({
                    workspaceId: userContext.workspace.id,
                    experimentId: experiment.id,
                    status: "FAILED",
                    totals: {
                        completedRuns,
                        failedRuns,
                    },
                    execution: failureMetrics,
                    error: serializedError,
                });
            } catch (persistenceError) {
                console.error("Failed to mark experiment as failed", persistenceError);
            }
        }

        return jsonResponse({
            error: serializedError.message,
            experimentId: experiment?.id ?? null,
            execution: {
                mode: "COMMISSIONING",
                wallTimeMs,
                d1: usageTracker,
            },
        }, 500);
    }
}

export async function handleRequest(request, env = {}, {
    resolveIdentity = resolveCloudflareAccessIdentity,
    createResearchRepository = createD1ResearchRepository,
    runResearchJob = runResearch,
} = {}) {
    const url = new URL(request.url);

    try {
        let identity;

        if (url.pathname.startsWith("/api/")) {
            identity = await resolveIdentity(request, env);
        }

        if (request.method === "GET" && url.pathname === "/api/health") {
            return jsonResponse({
                ok: true,
                service: "forex-backtester-research",
                executionEnabled: true,
                executionMode: "COMMISSIONING",
                d1Bound: Boolean(env.FOREX_DB?.prepare),
                researchD1Bound: Boolean(env.RESEARCH_DB?.prepare),
            });
        }

        if (request.method === "GET" && url.pathname === "/api/me") {
            if (!env.RESEARCH_DB?.prepare) {
                return jsonResponse({
                    error: "RESEARCH_DB D1 binding is unavailable",
                }, 503);
            }

            const repository = createResearchRepository({ db: env.RESEARCH_DB });
            const context = await repository.resolveUserContext(identity);
            const usageLimits = getAccountUsageLimits(context.user.account_role);

            return jsonResponse({
                ...context,
                usageLimits: {
                    ...usageLimits,
                    strategies: [...usageLimits.strategies],
                },
            });
        }

        if (request.method === "GET" && url.pathname === "/api/admin/users") {
            if (!env.RESEARCH_DB?.prepare) {
                return jsonResponse({
                    error: "RESEARCH_DB D1 binding is unavailable",
                }, 503);
            }

            const repository = createResearchRepository({ db: env.RESEARCH_DB });
            const context = await repository.resolveUserContext(identity);

            if (context.user.account_role !== "OWNER") {
                return jsonResponse({ error: "Admin access is required" }, 403);
            }

            const users = await repository.listAdminUsers();

            return jsonResponse({
                users: users.map((user) => ({
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name,
                    status: user.status,
                    accountRole: user.account_role,
                    createdAt: toIsoTimestamp(user.created_at),
                    updatedAt: toIsoTimestamp(user.updated_at),
                    lastSeenAt: toIsoTimestamp(user.last_seen_at),
                    lastExperimentAt: toIsoTimestamp(user.last_experiment_at),
                    workspaceCount: Number(user.workspace_count ?? 0),
                    experimentCount: Number(user.experiment_count ?? 0),
                    completedRunCount: Number(user.completed_run_count ?? 0),
                    detailedRerunCount: Number(user.detailed_rerun_count ?? 0),
                    datasetRows: Number(user.dataset_rows ?? 0),
                    candleEvaluations: Number(user.candle_evaluations ?? 0),
                })),
            });
        }

        if (request.method === "GET" && url.pathname === "/api/experiments") {
            if (!env.RESEARCH_DB?.prepare) {
                return jsonResponse({
                    error: "RESEARCH_DB D1 binding is unavailable",
                }, 503);
            }

            const repository = createResearchRepository({ db: env.RESEARCH_DB });
            const context = await repository.resolveUserContext(identity);
            const limit = parsePaginationInteger(
                url.searchParams.get("limit"),
                50,
                "limit"
            );
            const offset = parsePaginationInteger(
                url.searchParams.get("offset"),
                0,
                "offset"
            );

            if (limit < 1 || limit > 100) {
                throw new Error("limit must be between 1 and 100");
            }

            if (offset < 0) {
                throw new Error("offset must be non-negative");
            }

            const filters = {
                status: parseOptionalQueryText(
                    url.searchParams.get("status"),
                    "status"
                )?.toUpperCase(),
                strategy: parseOptionalQueryText(url.searchParams.get("strategy"), "strategy"),
                instrument: parseOptionalQueryText(
                    url.searchParams.get("instrument"),
                    "instrument"
                )?.toUpperCase(),
                timeframe: parseOptionalQueryText(
                    url.searchParams.get("timeframe"),
                    "timeframe"
                )?.toUpperCase(),
                minimumCompletedRuns: parseOptionalQueryNumber(
                    url.searchParams.get("minimumCompletedRuns"),
                    "minimumCompletedRuns",
                    { integer: true, minimum: 0 }
                ),
                minimumBestReturn: parseOptionalQueryNumber(
                    url.searchParams.get("minimumBestReturn"),
                    "minimumBestReturn"
                ),
                createdFrom: parseOptionalQueryDate(
                    url.searchParams.get("createdFrom"),
                    "createdFrom"
                ),
                createdTo: parseOptionalQueryDate(
                    url.searchParams.get("createdTo"),
                    "createdTo"
                ),
                search: parseOptionalQueryText(url.searchParams.get("search"), "search"),
            };
            if (
                filters.createdFrom !== undefined
                && filters.createdTo !== undefined
                && filters.createdFrom > filters.createdTo
            ) {
                throw new Error("createdFrom must not be after createdTo");
            }

            const sort = parseOptionalQueryText(url.searchParams.get("sort"), "sort")
                ?.toUpperCase() ?? "NEWEST";
            const matchingExperiments = await repository.listExperiments({
                workspaceId: context.workspace.id,
                limit: limit + 1,
                offset,
                filters,
                sort,
            });
            const hasMore = matchingExperiments.length > limit;
            const experiments = matchingExperiments.slice(0, limit);

            return jsonResponse({
                workspace: context.workspace,
                experiments: experiments.map((experiment) =>
                    serializeStoredExperiment(experiment)
                ),
                pagination: {
                    limit,
                    offset,
                    returned: experiments.length,
                    hasMore,
                    nextOffset: hasMore ? offset + experiments.length : null,
                },
            });
        }

        const detailedRerunMatch = request.method === "POST"
            ? url.pathname.match(/^\/api\/experiments\/([^/]+)\/runs\/([^/]+)\/detailed-rerun$/)
            : null;

        if (detailedRerunMatch) {
            if (!env.FOREX_DB?.prepare || !env.RESEARCH_DB?.prepare) {
                return jsonResponse({
                    error: "FOREX_DB and RESEARCH_DB D1 bindings are required",
                }, 503);
            }

            const repository = createResearchRepository({ db: env.RESEARCH_DB });
            const context = await repository.resolveUserContext(identity);
            const experimentId = decodeURIComponent(detailedRerunMatch[1]);
            const runId = decodeURIComponent(detailedRerunMatch[2]);
            const source = await repository.getExperimentRun({
                workspaceId: context.workspace.id,
                experimentId,
                runId,
            });

            if (!source) {
                return jsonResponse({ error: "Experiment run not found" }, 404);
            }

            return executeDetailedRerun({
                source,
                request,
                env,
                userContext: context,
                repository,
                runResearchJob,
            });
        }

        const runDetailsMatch = request.method === "GET"
            ? url.pathname.match(/^\/api\/runs\/([^/]+)\/details$/)
            : null;

        if (runDetailsMatch) {
            if (!env.RESEARCH_DB?.prepare) {
                return jsonResponse({ error: "RESEARCH_DB D1 binding is unavailable" }, 503);
            }

            const repository = createResearchRepository({ db: env.RESEARCH_DB });
            const context = await repository.resolveUserContext(identity);
            const runId = decodeURIComponent(runDetailsMatch[1]);
            const detail = await repository.getRunDetails({
                workspaceId: context.workspace.id,
                runId,
            });

            if (!detail) {
                return jsonResponse({ error: "Detailed run not found" }, 404);
            }

            return jsonResponse({
                run: serializeStoredRun(detail.run),
                trades: detail.trades.map(serializeStoredTrade),
                diagnosticEvents: detail.diagnosticEvents.map(serializeStoredDiagnosticEvent),
            });
        }

        const experimentDetailMatch = request.method === "GET"
            ? url.pathname.match(/^\/api\/experiments\/([^/]+)$/)
            : null;

        if (experimentDetailMatch) {
            if (!env.RESEARCH_DB?.prepare) {
                return jsonResponse({
                    error: "RESEARCH_DB D1 binding is unavailable",
                }, 503);
            }

            const repository = createResearchRepository({ db: env.RESEARCH_DB });
            const context = await repository.resolveUserContext(identity);
            const experimentId = decodeURIComponent(experimentDetailMatch[1]);
            const detail = await repository.getExperimentDetail({
                workspaceId: context.workspace.id,
                experimentId,
            });

            if (!detail) {
                return jsonResponse({ error: "Experiment not found" }, 404);
            }

            const periodsByRun = new Map();

            for (const period of detail.periodSummaries) {
                const periods = periodsByRun.get(period.run_id) ?? [];
                periods.push(period);
                periodsByRun.set(period.run_id, periods);
            }

            return jsonResponse({
                experiment: serializeStoredExperiment(
                    detail.experiment,
                    { includeConfig: true }
                ),
                runs: detail.runs.map((run) =>
                    serializeStoredRun(run, periodsByRun.get(run.id) ?? [])
                ),
                sourceRun: detail.sourceRun
                    ? serializeStoredRun(detail.sourceRun)
                    : null,
            });
        }

        if (request.method === "GET" && url.pathname === "/api/strategies") {
            return jsonResponse({
                strategies: listStrategyMetadata(),
            });
        }

        if (request.method === "POST" && url.pathname === "/api/plan") {
            const config = await readJson(request);
            let accountRole = "OWNER";

            if (env.RESEARCH_DB?.prepare) {
                const repository = createResearchRepository({ db: env.RESEARCH_DB });
                const context = await repository.resolveUserContext(identity);
                accountRole = context.user.account_role;
            }

            const { plan, usageEstimate, executionGate } = planExecution(
                config,
                accountRole
            );

            return jsonResponse({
                plan: summarizePlan(plan),
                usageEstimate,
                executionGate,
            });
        }

        if (request.method === "POST" && url.pathname === "/api/experiments") {
            const config = await readJson(request);
            return executeResearch(config, request, env, identity, {
                createResearchRepository,
                runResearchJob,
            });
        }

        if (url.pathname.startsWith("/api/")) {
            return jsonResponse({ error: "Not found" }, 404);
        }

        if (!env.ASSETS?.fetch) {
            return new Response("Static assets binding is unavailable", { status: 503 });
        }

        return env.ASSETS.fetch(request);
    } catch (error) {
        return jsonResponse({
            error: error?.message ?? String(error),
        }, error instanceof AuthenticationError ? error.status : 400);
    }
}

export default {
    fetch(request, env) {
        return handleRequest(request, env);
    },
};
