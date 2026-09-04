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

    /*
      Multi-timeframe execution is the next
      capability we will add.
  
      For now we explicitly prevent the engine
      pretending it supports something that
      it doesn't yet support.
    */
    if (
        executionTimeframe !==
        strategyTimeframe
    ) {
        throw new Error(
            "Separate strategy and execution timeframes are not supported yet"
        );
    }

    const candles =
        await getCandles({
            instrument,
            granularity:
                strategyTimeframe,
            from,
            to,
        });

    const instrumentMetadata =
        getInstrumentMetadata(
            instrument
        );

    const result =
        runBacktest({
            candles,
            strategy,

            pipSize:
                instrumentMetadata.pipSize,

            instrument,
            timeframe:
                strategyTimeframe,
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
            candleCount:
                candles.length,

            firstCandleTime:
                candles[0]?.time ?? null,

            lastCandleTime:
                candles[
                    candles.length - 1
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