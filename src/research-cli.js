import "dotenv/config";

import researchConfig from "../research.config.js";

import {
    printBacktestExperimentPlan,
    printBacktestExperimentResult,
} from "./reporting/console-reporter.js";

import {
    writeExperimentResult,
} from "./reporting/json-result-writer.js";

import {
    planResearch,
    runResearch,
} from "./research/run-research.js";

async function main() {
    const plan = planResearch(researchConfig);

    printBacktestExperimentPlan(plan);

    if (!plan.allowed) {
        process.exitCode = 1;
        return;
    }

    console.log("");
    console.log("Loading historical data once, then running the research experiment...");

    const result = await runResearch(researchConfig, {
        includeTrades: false,
        includeRunDetails: false,
        captureEquityCurve: false,

        onProgress: ({ completedRuns, totalRuns, currentRun }) => {
            const elapsedSeconds = (currentRun.elapsedMs / 1000).toFixed(1);

            console.log(
                `Completed ${completedRuns}/${totalRuns} backtests (${elapsedSeconds}s)`
            );
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
