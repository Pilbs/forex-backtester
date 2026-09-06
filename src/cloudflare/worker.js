import { planResearch } from "../research/run-research.js";
import { listStrategyMetadata } from "../strategies/strategy-registry.js";
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

export async function handleRequest(request, env = {}) {
    const url = new URL(request.url);

    try {
        if (request.method === "GET" && url.pathname === "/api/health") {
            return jsonResponse({
                ok: true,
                service: "forex-backtester-research",
                executionEnabled: false,
            });
        }

        if (request.method === "GET" && url.pathname === "/api/strategies") {
            return jsonResponse({
                strategies: listStrategyMetadata(),
            });
        }

        if (request.method === "POST" && url.pathname === "/api/plan") {
            const config = await readJson(request);
            const plan = planResearch(config);
            const usageEstimate = estimateResearchUsage(config, plan);

            return jsonResponse({
                plan: summarizePlan(plan),
                usageEstimate,
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
        }, 400);
    }
}

export default {
    fetch(request, env) {
        return handleRequest(request, env);
    },
};
