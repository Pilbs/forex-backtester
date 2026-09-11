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
import { assessResearchExecution } from "./research-execution-gate.js";
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

function planExecution(config) {
    const plan = planResearch(config);
    const usageEstimate = estimateResearchUsage(config, plan);
    const executionGate = assessResearchExecution(config, plan, usageEstimate);

    return {
        plan,
        usageEstimate,
        executionGate,
    };
}

async function executeResearch(config, request, env, identity, {
    createResearchRepository,
    runResearchJob,
}) {
    const { plan, usageEstimate, executionGate } = planExecution(config);

    if (!executionGate.allowed) {
        return jsonResponse({
            error: "Execution blocked by cloud commissioning limits",
            plan: summarizePlan(plan),
            usageEstimate,
            executionGate,
        }, 422);
    }

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

            return jsonResponse(context);
        }

        if (request.method === "GET" && url.pathname === "/api/strategies") {
            return jsonResponse({
                strategies: listStrategyMetadata(),
            });
        }

        if (request.method === "POST" && url.pathname === "/api/plan") {
            const config = await readJson(request);
            const { plan, usageEstimate, executionGate } = planExecution(config);

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
