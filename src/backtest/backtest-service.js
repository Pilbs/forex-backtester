import {
    getCandles,
} from "../data/candle-reader.js";

import {
    runBacktest,
} from "./backtest-runner.js";

import {
    summarizeTrades,
} from "./backtest-summary.js";

import {
    getInstrumentMetadata,
} from "../market/instrument-metadata.js";

export async function runBacktestJob({
    instrument,
    strategyTimeframe,
    executionTimeframe =
    strategyTimeframe,

    from,
    to,

    strategy,
}) {
    if (!instrument) {
        throw new Error(
            "instrument is required"
        );
    }

    if (!strategyTimeframe) {
        throw new Error(
            "strategyTimeframe is required"
        );
    }

    if (!from || !to) {
        throw new Error(
            "from and to are required"
        );
    }

    if (!strategy) {
        throw new Error(
            "strategy is required"
        );
    }

    const strategyCandles =
        await getCandles({
            instrument,
            granularity:
                strategyTimeframe,
            from,
            to,
        });

    const executionCandles =
        executionTimeframe ===
            strategyTimeframe
            ? strategyCandles
            : await getCandles({
                instrument,
                granularity:
                    executionTimeframe,
                from,
                to,
            });


    const instrumentMetadata =
        getInstrumentMetadata(
            instrument
        );

    const result =
        runBacktest({
            strategyCandles,
            executionCandles,

            strategy,

            pipSize:
                instrumentMetadata.pipSize,

            instrument,

            strategyTimeframe,
            executionTimeframe,
        });

    const summary =
        summarizeTrades(
            result.trades
        );

    return {
        config: {
            instrument,

            strategy:
                strategy.name ?? null,

            strategyTimeframe,
            executionTimeframe,

            pipSize:
                instrumentMetadata.pipSize,

            from,
            to,
        },


        data: {
            strategyCandleCount:
                strategyCandles.length,

            executionCandleCount:
                executionCandles.length,

            firstStrategyCandleTime:
                strategyCandles[0]
                    ?.time ?? null,

            lastStrategyCandleTime:
                strategyCandles[
                    strategyCandles.length - 1
                ]?.time ?? null,

            firstExecutionCandleTime:
                executionCandles[0]
                    ?.time ?? null,

            lastExecutionCandleTime:
                executionCandles[
                    executionCandles.length - 1
                ]?.time ?? null,
        },

        summary,

        signals:
            result.signals,

        trades:
            result.trades,

        openPosition:
            result.openPosition,
    };
}