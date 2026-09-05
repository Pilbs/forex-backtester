import "dotenv/config";

import {
    loadBacktestDataset,
    runBacktestWithDataset,
} from "../backtest/backtest-service.js";
import {
    printParameterSweepPlan,
    printParameterSweepResult,
} from "../reporting/console-reporter.js";
import { writeExperimentResult } from "../reporting/json-result-writer.js";
import { planParameterSweep } from "../research/experiment-planner.js";
import { runParameterSweep } from "../research/parameter-sweep.js";
import { orbDefinition } from "../strategies/orb/orb-definition.js";

async function main() {
    const backtestConfig = {
        instrument: "EUR_USD",
        strategyTimeframe: "M5",
        executionTimeframe: "M1",
        from: "2022-01-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
    };

    const baseStrategyConfig = {
        startHour: 8,
        startMinute: 15,
        durationMinutes: 60,
        timeZone: "America/New_York",
        stopLossPips: 10,
        takeProfitPips: 20,
    };

    const parameterGrid = {
        stopLossPips: [5, 10, 15],
        takeProfitPips: [10, 15, 20, 25, 30, 35, 40],
    };

    const policy = {
        warningRunCount: 100,
        maximumRunCount: 5000,
    };

    const plan = planParameterSweep({
        strategyDefinition: orbDefinition,
        baseStrategyConfig,
        parameterGrid,
        policy,
    });

    printParameterSweepPlan(plan);

    if (!plan.allowed) {
        process.exitCode = 1;
        return;
    }

    console.log("");
    console.log("Loading historical data once for the complete experiment...");

    const dataset = await loadBacktestDataset(backtestConfig);

    console.table([{
        instrument: dataset.config.instrument,
        strategyTimeframe: dataset.config.strategyTimeframe,
        executionTimeframe: dataset.config.executionTimeframe,
        strategyCandles: dataset.data.strategyCandleCount,
        executionCandles: dataset.data.executionCandleCount,
        from: dataset.config.from,
        to: dataset.config.to,
    }]);

    const result = await runParameterSweep({
        strategyDefinition: orbDefinition,
        baseStrategyConfig,
        parameterGrid,
        policy,
        includeTrades: false,
        executeRun: async ({ strategy }) => runBacktestWithDataset({
            dataset,
            strategy,
        }),
        onProgress: ({ completedRuns, totalRuns }) => {
            console.log(`Completed ${completedRuns}/${totalRuns} backtests`);
        },
    });

    printParameterSweepResult(result);

    const filePath = await writeExperimentResult(result);
    console.log("");
    console.log(`Experiment JSON written to ${filePath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
