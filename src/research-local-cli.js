import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
    printBacktestExperimentPlan,
    printBacktestExperimentResult,
} from "./reporting/console-reporter.js";
import { writeExperimentResult } from "./reporting/json-result-writer.js";
import { writeExperimentCsv } from "./reporting/csv-result-writer.js";
import { createLocalCsvDatasetLoader } from "./local/local-csv-dataset-loader.js";
import { planResearch, runResearch } from "./research/run-research.js";

function parseArgs(argv) {
    const args = {
        csv: null,
        config: "research.local.config.json",
        granularity: "M1",
    };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === "--csv") {
            args.csv = next;
            index++;
        } else if (arg === "--config") {
            args.config = next;
            index++;
        } else if (arg === "--granularity") {
            args.granularity = next;
            index++;
        } else if (arg === "--help" || arg === "-h") {
            args.help = true;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;
}

function printUsage() {
    console.log(
        "Usage: npm run research:local -- --csv <candles.csv> "
        + "[--config research.local.config.json] [--granularity M1]"
    );
}

async function loadConfig(configPath) {
    const absolutePath = path.resolve(configPath);
    const extension = path.extname(absolutePath).toLowerCase();

    if (extension === ".json") {
        const raw = await fs.readFile(absolutePath, "utf8");
        const config = JSON.parse(raw);

        if (!config || typeof config !== "object" || Array.isArray(config)) {
            throw new Error(`${configPath} must contain a JSON object`);
        }

        return config;
    }

    const module = await import(pathToFileURL(absolutePath).href);

    if (!module.default || typeof module.default !== "object") {
        throw new Error(`${configPath} must default-export a research config object`);
    }

    return module.default;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        printUsage();
        return;
    }

    if (!args.csv) {
        printUsage();
        throw new Error("--csv is required");
    }

    const config = await loadConfig(args.config);
    const plan = planResearch(config);

    printBacktestExperimentPlan(plan);

    if (!plan.allowed) {
        process.exitCode = 1;
        return;
    }

    const datasetLoader = createLocalCsvDatasetLoader({
        csvPath: path.resolve(args.csv),
        granularity: args.granularity,
    });

    console.log("");
    console.log("Running locally with the StratTest JavaScript engine...");
    console.log(`CSV: ${path.resolve(args.csv)}`);

    const totalStarted = performance.now();

    const result = await runResearch(config, {
        includeTrades: false,
        includeRunDetails: false,
        captureEquityCurve: false,
        datasetLoader,

        onProgress: ({ completedRuns, totalRuns, currentRun }) => {
            const elapsedSeconds = (currentRun.elapsedMs / 1000).toFixed(2);
            console.log(
                `Completed ${completedRuns}/${totalRuns} backtests (${elapsedSeconds}s)`
            );
        },
    });

    const totalElapsedMs = Math.round(performance.now() - totalStarted);

    printBacktestExperimentResult(result, {
        sortBy: "returnPercent",
        sortDirection: "desc",
    });

    const candleCount = result.experiment.dataset?.strategyCandleCount ?? 0;
    const completedRuns = result.totals.completedRuns;
    const evaluations = candleCount * completedRuns;
    const runElapsedMs = result.experiment.elapsedMs || 0;
    const evaluationsPerSecond = runElapsedMs > 0
        ? Math.round(evaluations / (runElapsedMs / 1000))
        : null;

    console.log("");
    console.log("Local performance");
    console.table([{
        candlesLoaded: candleCount,
        runs: completedRuns,
        candleEvaluations: evaluations,
        datasetLoadMs: result.experiment.datasetLoadElapsedMs,
        sweepElapsedMs: runElapsedMs,
        totalElapsedMs,
        evaluationsPerSecond,
    }]);

    const outputDirectory = "output/local-experiments";
    const jsonPath = await writeExperimentResult(result, {
        directory: outputDirectory,
    });
    const csvPath = await writeExperimentCsv(result, {
        directory: outputDirectory,
    });

    console.log("");
    console.log(`Local experiment CSV written to ${csvPath}`);
    console.log(`Local experiment JSON written to ${jsonPath}`);
    console.log("Send the CSV back for sweep analysis; keep the JSON as the full audit record.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
