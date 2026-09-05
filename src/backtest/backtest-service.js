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
    if (!instrument) throw new Error("instrument is required");
    if (!strategyTimeframe) throw new Error("strategyTimeframe is required");
    if (!executionTimeframe) throw new Error("executionTimeframe is required");
    if (!from || !to) throw new Error("from and to are required");
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
            baseCurrency: instrumentMetadata.baseCurrency,
            quoteCurrency: instrumentMetadata.quoteCurrency,
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
    accountConfig = {},
    executionPolicy = {},
    captureEquityCurve = false,
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
        baseCurrency,
        quoteCurrency,
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
        accountConfig,
        executionPolicy,
        captureEquityCurve,
    });

    return {
        config: {
            instrument,
            strategy: strategy.name ?? null,
            strategyTimeframe,
            executionTimeframe,
            pipSize,
            baseCurrency,
            quoteCurrency,
            from,
            to,
            account: result.accountConfig,
            execution: result.executionPolicy,
        },
        data: dataset.data,
        summary: summarizeTrades(result.trades),
        account: result.account,
        signals: result.signals,
        orders: result.orders,
        fills: result.fills,
        rejectedOrders: result.rejectedOrders,
        trades: result.trades,
        openTrades: result.openTrades,
        pendingOrders: result.pendingOrders,
        riskEvents: result.riskEvents,
        equityCurve: result.equityCurve,
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
    accountConfig = {},
    executionPolicy = {},
    captureEquityCurve = false,
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
        accountConfig,
        executionPolicy,
        captureEquityCurve,
    });
}
