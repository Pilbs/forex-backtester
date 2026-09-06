import { planResearch, runResearch } from "../research/run-research.js";
import { listStrategyMetadata } from "../strategies/strategy-registry.js";
import {
    createCloudflareDatasetLoader,
    createD1UsageTracker,
} from "./d1-dataset-loader.js";
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

async function executeResearch(config, env) {
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

    const usageTracker = createD1UsageTracker();
    const started = performance.now();

    try {
        const result = await runResearch(config, {
            includeTrades: false,
            includeRunDetails: false,
            captureEquityCurve: false,
            stopOnError: false,
            datasetLoader: createCloudflareDatasetLoader({
                db: env.FOREX_DB,
                usageTracker,
            }),
        });

        return jsonResponse({
            status: "COMPLETED",
            execution: {
                mode: "COMMISSIONING",
                wallTimeMs: Math.round(performance.now() - started),
                d1: usageTracker,
            },
            usageEstimate,
            executionGate,
            result: summarizeResearchResult(result),
        });
    } catch (error) {
        return jsonResponse({
            error: error?.message ?? String(error),
            execution: {
                mode: "COMMISSIONING",
                wallTimeMs: Math.round(performance.now() - started),
                d1: usageTracker,
            },
        }, 500);
    }
}

export async function handleRequest(request, env = {}) {
    const url = new URL(request.url);

    try {
        if (request.method === "GET" && url.pathname === "/api/health") {
            return jsonResponse({
                ok: true,
                service: "forex-backtester-research",
                executionEnabled: true,
                executionMode: "COMMISSIONING",
                d1Bound: Boolean(env.FOREX_DB?.prepare),
            });
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
            return executeResearch(config, env);
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
        }, 400);
    }
}

export default {
    fetch(request, env) {
        return handleRequest(request, env);
    },
};
