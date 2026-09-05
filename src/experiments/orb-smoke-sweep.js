import "dotenv/config";

import {    printBacktestExperimentPlan,    printBacktestExperimentResult,} from "../reporting/console-reporter.js";
import {    writeExperimentResult,} from "../reporting/json-result-writer.js";
import {    planBacktestExperiment,    runBacktestExperiment,} from "../research/backtest-experiment.js";
import {    orbDefinition,} from "../strategies/orb/orb-definition.js";

const EXPERIMENT_ID = "human-v1-orb-smoke";

async function main() {
    const experimentConfig = {
        strategyDefinition: orbDefinition,

        backtestConfig: {
            instrument: "EUR_USD",
            strategyTimeframe: "M5",
            executionTimeframe: "M1",
            from: "2026-06-01T00:00:00Z",
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
                maxOpenTrades: 3,
                maxMarginUsagePercent: 80,
                maxDrawdownPercent: 20,
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
            stopLossPips: [8, 10, 12],
            takeProfitPips: [15, 20],
        },

        policy: {
            warningRunCount: 25,
            maximumRunCount: 100,
        },
    };

    const plan = planBacktestExperiment(experimentConfig);

    printBacktestExperimentPlan(plan);

    if (!plan.allowed) {
        process.exitCode = 1;
        return;
    }

    console.log("");
    console.log(
        "Loading three months of D1 history once, then running 6 account-aware backtests..."
    );

    const result = await runBacktestExperiment({
        ...experimentConfig,
        experimentId: EXPERIMENT_ID,

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

    const filePath = await writeExperimentResult(result, {
        fileName: `${EXPERIMENT_ID}.json`,
    });

    console.log("");
    console.log(`Acceptance experiment JSON written to ${filePath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
