import "dotenv/config";

import {
    printBacktestExperimentPlan,
    printBacktestExperimentResult,
} from "../reporting/console-reporter.js";
import { writeExperimentResult } from "../reporting/json-result-writer.js";
import {
    planBacktestExperiment,
    runBacktestExperiment,
} from "../research/backtest-experiment.js";
import { orbDefinition } from "../strategies/orb/orb-definition.js";

async function main() {
    const experimentConfig = {
        strategyDefinition: orbDefinition,

        backtestConfig: {
            instrument: "EUR_USD",
            strategyTimeframe: "M5",
            executionTimeframe: "M1",
            from: "2023-01-01T00:00:00Z",
            to: "2026-09-01T00:00:00Z",
        },

        accountConfig: {
            initialCapital: 500,
            currency: "USD",
            leverage: 30,
            positionMode: "HEDGING",
            defaultSizing: {
                type: "CASH",
                value: 300,
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
            orbStartHour: 8,
            orbStartMinute: 15,
            orbDurationMinutes: 60,
            timezoneMode: "EXCHANGE",
            breakoutCondition: "CLOSE",
            requiredRetests: 1,
            breakoutDistanceEntryEnabled: true,
            breakoutDistanceMode: "ATR",
            breakoutDistanceValue: 1,
            atrLength: 12,
            stopLossMode: "PERCENT",
            stopLossValue: 0.20,
            takeProfitMode: "ATR",
            takeProfitValue: 3,
        },

        parameterGrid: {
            breakoutCondition: ["CLOSE", "WICK"],
            breakoutDistanceValue: [0.5, 1],
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
    console.log("Testing the four CLOSE/WICK and ATR breakout-distance combinations...");

    const result = await runBacktestExperiment({
        ...experimentConfig,
        experimentId: "orb-breakout-distance-source-test",
        includeTrades: true,
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
