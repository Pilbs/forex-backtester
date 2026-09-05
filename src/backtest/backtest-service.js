import { getCandles } from "../data/candle-reader.js";
import { getInstrumentMetadata } from "../market/instrument-metadata.js";
import { runBacktest } from "./backtest-runner.js";
import { summarizeTrades } from "./backtest-summary.js";

function validateBacktestRequest({
    instrument,
    strategyTimeframe,
    executionTimeframe,
    from,
    to,
}) {
    if (!instrument) {
        throw new Error("instrument is required");
    }

    if (!strategyTimeframe) {
        throw new Error("strategyTimeframe is required");
    }

    if (!executionTimeframe) {
        throw new Error("executionTimeframe is required");
    }

    if (!from || !to) {
        throw new Error("from and to are required");
    }
}

export async function loadBacktestDataset({
    instrument,
    strategyTimeframe,
    executionTimeframe = strategyTimeframe,
    from,
    to,
}) {
    validateBacktestRequest({
        instrument,
        strategyTimeframe,
        executionTimeframe,
        from,
        to,
    });

    const instrumentMetadata = getInstrumentMetadata(instrument);
    const strategyCandles = await getCandles({
        instrument,
        granularity: strategyTimeframe,
        from,
        to,
    });
    const executionCandles = executionTimeframe === strategyTimeframe
        ? strategyCandles
        : await getCandles({
            instrument,
            granularity: executionTimeframe,
            from,
            to,
        });

    return {
        config: {
            instrument,
            strategyTimeframe,
            executionTimeframe,
            pipSize: instrumentMetadata.pipSize,
            from,
            to,
        },
        data: {
            strategyCandleCount: strategyCandles.length,
            executionCandleCount: executionCandles.length,
            firstStrategyCandleTime: strategyCandles[0]?.time ?? null,
            lastStrategyCandleTime: strategyCandles.at(-1)?.time ?? null,
            firstExecutionCandleTime: executionCandles[0]?.time ?? null,
            lastExecutionCandleTime: executionCandles.at(-1)?.time ?? null,
        },
        strategyCandles,
        executionCandles,
    };
}

export function runBacktestWithDataset({
    dataset,
    strategy,
}) {
    if (!dataset || typeof dataset !== "object") {
        throw new Error("dataset is required");
    }

    if (!strategy) {
        throw new Error("strategy is required");
    }

    const {
        instrument,
        strategyTimeframe,
        executionTimeframe,
        pipSize,
        from,
        to,
    } = dataset.config ?? {};

    const result = runBacktest({
        strategyCandles: dataset.strategyCandles,
        executionCandles: dataset.executionCandles,
        strategy,
        pipSize,
        instrument,
        strategyTimeframe,
        executionTimeframe,
    });

    return {
        config: {
            instrument,
            strategy: strategy.name ?? null,
            strategyTimeframe,
            executionTimeframe,
            pipSize,
            from,
            to,
        },
        data: dataset.data,
        summary: summarizeTrades(result.trades),
        signals: result.signals,
        trades: result.trades,
        openPosition: result.openPosition,
        pendingEntry: result.pendingEntry,
        processedStrategyCandles: result.processedStrategyCandles,
        processedExecutionCandles: result.processedExecutionCandles,
    };
}

export async function runBacktestJob({
    instrument,
    strategyTimeframe,
    executionTimeframe = strategyTimeframe,
    from,
    to,
    strategy,
}) {
    if (!strategy) {
        throw new Error("strategy is required");
    }

    const dataset = await loadBacktestDataset({
        instrument,
        strategyTimeframe,
        executionTimeframe,
        from,
        to,
    });

    return runBacktestWithDataset({
        dataset,
        strategy,
    });
}
