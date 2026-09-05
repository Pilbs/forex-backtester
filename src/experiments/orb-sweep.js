import "dotenv/config";

import {
    printBacktestExperimentPlan,
    printBacktestExperimentResult,
} from "../reporting/console-reporter.js";

import {
    writeExperimentResult,
} from "../reporting/json-result-writer.js";

import {
    planBacktestExperiment,
    runBacktestExperiment,
} from "../research/backtest-experiment.js";

import {
    orbDefinition,
} from "../strategies/orb/orb-definition.js";

async function main() {
    const experimentConfig = {
        strategyDefinition: orbDefinition,

        backtestConfig: {
            instrument: "EUR_USD",
            strategyTimeframe: "M5",
            executionTimeframe: "M1",
            from: "2022-01-01T00:00:00Z",
            to: "2026-09-01T00:00:00Z",
        },

        accountConfig: {
            initialCapital: 10000,
            currency: "USD",
            leverage: 30,
            positionMode: "HEDGING",

            defaultSizing: {
                type: "RISK_PERCENT",
                value: 1,
            },

            risk: {
                maxOpenTrades: 5,
                maxMarginUsagePercent: 80,
                maxDrawdownPercent: 25,
                breachAction: "HALT_NEW_ENTRIES",
            },
        },

        executionPolicy: {
            sameCandleConflict: "STOP_FIRST",
            slippagePips: 0,

            commission: {
                type: "NONE",
                value: 0,
            },

            closeOpenTradesAtEnd: true,
        },

        baseStrategyConfig: {
            startHour: 8,
            startMinute: 15,
            durationMinutes: 60,
            timeZone: "America/New_York",
            stopLossPips: 10,
            takeProfitPips: 20,
        },

        parameterGrid: {
            stopLossPips: [5, 10, 15],
            takeProfitPips: [10, 15, 20, 25, 30, 35, 40],
        },

        policy: {
            warningRunCount: 100,
            maximumRunCount: 5000,
        },
    };

    const plan = planBacktestExperiment(experimentConfig);

    printBacktestExperimentPlan(plan);

    if (!plan.allowed) {
        process.exitCode = 1;
        return;
    }

    console.log("");
    console.log("Loading historical data once, then running all parameter combinations...");

    const result = await runBacktestExperiment({
        ...experimentConfig,

        includeTrades: false,
        includeRunDetails: false,
        captureEquityCurve: false,

        onProgress: ({ completedRuns, totalRuns }) => {
            console.log(`Completed ${completedRuns}/${totalRuns} backtests`);
        },
    });

    printBacktestExperimentResult(result, {
        sortBy: "returnPercent",
        sortDirection: "desc",
    });

    const filePath = await writeExperimentResult(result);

    console.log("");
    console.log(`Experiment JSON written to ${filePath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
