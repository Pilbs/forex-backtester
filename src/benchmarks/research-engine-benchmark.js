import process from "node:process";
import { performance } from "node:perf_hooks";

import { runResearch } from "../research/run-research.js";

const M5_MS = 5 * 60 * 1000;
const START_TIME = Date.parse("2025-01-06T00:00:00Z");
const SUPPORTED_STRATEGIES = new Set(["simple-sma", "orb"]);

function readArgument(name) {
    const prefix = `--${name}=`;
    const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));

    return argument?.slice(prefix.length);
}

function parsePositiveIntegerList(name, fallback) {
    const rawValue = readArgument(name);

    if (!rawValue) {
        return fallback;
    }

    const values = rawValue.split(",").map((value) => Number(value.trim()));

    if (values.length === 0 || values.some((value) => !Number.isInteger(value) || value < 1)) {
        throw new Error(`--${name} must be a comma-separated list of positive integers`);
    }

    return [...new Set(values)];
}

function parseStrategies() {
    const rawValue = readArgument("strategies");
    const strategies = rawValue
        ? rawValue.split(",").map((value) => value.trim()).filter(Boolean)
        : [...SUPPORTED_STRATEGIES];

    const unsupported = strategies.filter((strategy) => !SUPPORTED_STRATEGIES.has(strategy));

    if (unsupported.length > 0) {
        throw new Error(`Unsupported benchmark strategies: ${unsupported.join(", ")}`);
    }

    return [...new Set(strategies)];
}

function priceSide(open, high, low, close, offset) {
    return {
        open: open + offset,
        high: high + offset,
        low: low + offset,
        close: close + offset,
    };
}

function createSyntheticDataset(candleCount) {
    const candles = new Array(candleCount);
    const spread = 0.0001;
    let previousClose = 1.1000;

    for (let index = 0; index < candleCount; index++) {
        const wave = Math.sin(index / 19) * 0.00018;
        const slowerWave = Math.sin(index / 173) * 0.00008;
        const open = previousClose;
        const close = open + wave + slowerWave;
        const high = Math.max(open, close) + 0.00012;
        const low = Math.min(open, close) - 0.00012;
        const time = START_TIME + index * M5_MS;

        candles[index] = {
            time,
            complete: true,
            volume: 100 + index % 50,
            bid: priceSide(open, high, low, close, -spread / 2),
            ask: priceSide(open, high, low, close, spread / 2),
            mid: priceSide(open, high, low, close, 0),
        };

        previousClose = close;
    }

    const to = new Date(START_TIME + candleCount * M5_MS).toISOString();

    return {
        config: {
            instrument: "EUR_USD",
            strategyTimeframe: "M5",
            executionTimeframe: "M5",
            pipSize: 0.0001,
            baseCurrency: "EUR",
            quoteCurrency: "USD",
            from: new Date(START_TIME).toISOString(),
            to,
        },
        data: {
            strategyCandleCount: candleCount,
            executionCandleCount: candleCount,
            firstStrategyCandleTime: candles[0]?.time ?? null,
            lastStrategyCandleTime: candles.at(-1)?.time ?? null,
            firstExecutionCandleTime: candles[0]?.time ?? null,
            lastExecutionCandleTime: candles.at(-1)?.time ?? null,
        },
        strategyCandles: candles,
        executionCandles: candles,
    };
}

function createParameterGrid(strategy, runCount) {
    if (strategy === "simple-sma") {
        return {
            smaLength: Array.from({ length: runCount }, (_, index) => index + 2),
        };
    }

    return {
        atrLength: Array.from({ length: runCount }, (_, index) => index + 2),
    };
}

function createResearchConfig(strategy, dataset, runCount) {
    return {
        strategy,
        market: {
            instrument: dataset.config.instrument,
            strategyTimeframe: dataset.config.strategyTimeframe,
            executionTimeframe: dataset.config.executionTimeframe,
            from: dataset.config.from,
            to: dataset.config.to,
        },
        account: {
            initialCapital: 10_000,
            currency: "USD",
            leverage: 30,
            positionMode: "HEDGING",
            defaultSizing: {
                type: "UNITS",
                value: 1_000,
            },
        },
        execution: {
            sameCandleConflict: "STOP_FIRST",
            closeOpenTradesAtEnd: true,
        },
        strategyConfig: {},
        parameterGrid: createParameterGrid(strategy, runCount),
        policy: {
            warningRunCount: 5_000,
            maximumRunCount: 5_000,
        },
    };
}

async function runCase({ strategy, candleCount, runCount, dataset }) {
    const config = createResearchConfig(strategy, dataset, runCount);
    const cpuBefore = process.cpuUsage();
    const wallStarted = performance.now();

    const result = await runResearch(config, {
        experimentId: `benchmark-${strategy}-${candleCount}-${runCount}`,
        datasetLoader: async () => dataset,
    });

    const wallTimeMs = performance.now() - wallStarted;
    const cpuUsage = process.cpuUsage(cpuBefore);
    const cpuTimeMs = (cpuUsage.user + cpuUsage.system) / 1_000;
    const evaluations = candleCount * result.totals.completedRuns;

    return {
        strategy,
        candles: candleCount,
        runs: result.totals.completedRuns,
        evaluations,
        wallMs: Math.round(wallTimeMs),
        cpuMs: Math.round(cpuTimeMs),
        evaluationsPerCpuSecond: cpuTimeMs > 0
            ? Math.round(evaluations / (cpuTimeMs / 1_000))
            : null,
        failedRuns: result.totals.failedRuns,
    };
}

async function main() {
    const candleCounts = parsePositiveIntegerList("candles", [1_000, 5_000]);
    const runCounts = parsePositiveIntegerList("runs", [1, 6]);
    const strategies = parseStrategies();
    const datasets = new Map();
    const results = [];

    for (const candleCount of candleCounts) {
        datasets.set(candleCount, createSyntheticDataset(candleCount));
    }

    await runCase({
        strategy: "simple-sma",
        candleCount: Math.min(2_000, candleCounts[0]),
        runCount: 1,
        dataset: createSyntheticDataset(Math.min(2_000, candleCounts[0])),
    });

    for (const strategy of strategies) {
        for (const candleCount of candleCounts) {
            for (const runCount of runCounts) {
                console.log(`Running ${strategy}: ${candleCount.toLocaleString()} candles x ${runCount} runs`);

                const result = await runCase({
                    strategy,
                    candleCount,
                    runCount,
                    dataset: datasets.get(candleCount),
                });

                results.push(result);
                console.table([result]);
            }
        }
    }

    console.log(`Node ${process.version} on ${process.platform}/${process.arch}`);
    console.table(results);
    console.log(JSON.stringify({
        generatedAt: new Date().toISOString(),
        environment: {
            node: process.version,
            platform: process.platform,
            architecture: process.arch,
        },
        results,
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
