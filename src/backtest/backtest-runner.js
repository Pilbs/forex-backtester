import {
    validateStrategy,
} from "../strategies/strategy-interface.js";

import {
    validateTradeIntent,
} from "../strategies/trade-intent.js";

import {
    createStrategyContext,
} from "./strategy-context.js";

import {
    getTimeframeDurationMs,
} from "../market/timeframe.js";

function calculatePnlPips({
    side,
    entryPrice,
    exitPrice,
    pipSize,
}) {
    const priceDifference =
        side === "LONG"
            ? exitPrice - entryPrice
            : entryPrice - exitPrice;

    return Number(
        (
            priceDifference /
            pipSize
        ).toFixed(1)
    );
}

function resolveLevel({
    level,
    side,
    entryPrice,
    pipSize,
    purpose,
}) {
    if (level.type === "PRICE") {
        return level.value;
    }

    const direction =
        side === "LONG"
            ? 1
            : -1;

    const distance =
        level.value * pipSize;

    if (purpose === "STOP_LOSS") {
        return (
            entryPrice -
            direction * distance
        );
    }

    if (purpose === "TAKE_PROFIT") {
        return (
            entryPrice +
            direction * distance
        );
    }

    throw new Error(
        `Unknown level purpose: ${purpose}`
    );
}

function validateCandles(
    candles,
    name
) {
    if (!Array.isArray(candles)) {
        throw new Error(
            `${name} must be an array`
        );
    }

    if (candles.length === 0) {
        throw new Error(
            `No ${name} supplied to backtest`
        );
    }

    let previousTime = null;

    for (const candle of candles) {
        if (
            !Number.isFinite(
                candle.time
            )
        ) {
            throw new Error(
                `${name} contains an invalid time`
            );
        }

        if (
            previousTime !== null &&
            candle.time <= previousTime
        ) {
            throw new Error(
                `${name} are not chronological at ` +
                new Date(
                    candle.time
                ).toISOString()
            );
        }

        previousTime =
            candle.time;
    }
}

export function runBacktest({
    strategyCandles,
    executionCandles,

    strategy,

    pipSize,

    instrument,
    strategyTimeframe,
    executionTimeframe,
}) {
    validateCandles(
        strategyCandles,
        "strategyCandles"
    );

    validateCandles(
        executionCandles,
        "executionCandles"
    );

    if (
        !Number.isFinite(pipSize) ||
        pipSize <= 0
    ) {
        throw new Error(
            "pipSize must be a positive number"
        );
    }

    validateStrategy(strategy);

    if (strategy.reset) {
        strategy.reset();
    }

    const strategyDurationMs =
        getTimeframeDurationMs(
            strategyTimeframe
        );

    let strategyIndex = 0;

    let pendingEntry = null;
    let openPosition = null;

    const signals = [];
    const trades = [];

    for (
        let executionIndex = 0;
        executionIndex <
        executionCandles.length;
        executionIndex++
    ) {
        const executionCandle =
            executionCandles[
            executionIndex
            ];

        /*
          Make completed strategy candles
          available to the strategy.
    
          Example:
    
          M5 candle starts 09:15
          M5 candle completes 09:20
    
          It therefore becomes visible when
          execution time reaches 09:20.
        */
        while (
            strategyIndex <
            strategyCandles.length
        ) {
            const strategyCandle =
                strategyCandles[
                strategyIndex
                ];

            const strategyCloseTime =
                strategyCandle.time +
                strategyDurationMs;

            if (
                strategyCloseTime >
                executionCandle.time
            ) {
                break;
            }

            const context =
                createStrategyContext({
                    candles:
                        strategyCandles,

                    index:
                        strategyIndex,

                    instrument,

                    timeframe:
                        strategyTimeframe,
                });

            const signal =
                strategy.onCandle(
                    context
                );

            if (signal) {
                validateTradeIntent(signal);
                signals.push({
                    /*
                      time = source strategy
                      candle's start time.
          
                      decisionTime = when that
                      candle became complete.
                    */
                    time:
                        strategyCandle.time,

                    decisionTime:
                        strategyCloseTime,

                    index:
                        strategyIndex,

                    ...signal,
                });

                if (
                    signal.action ===
                    "ENTER" &&
                    !openPosition &&
                    !pendingEntry
                ) {
                    pendingEntry = {
                        side:
                            signal.side,

                        signalTime:
                            strategyCandle.time,

                        decisionTime:
                            strategyCloseTime,

                        stopLoss:
                            signal.stopLoss,

                        takeProfit:
                            signal.takeProfit,
                    };
                }
            }

            strategyIndex++;
        }

        /*
          Any signal available at this
          execution candle can enter at
          this candle's open.
        */
        if (
            pendingEntry &&
            !openPosition
        ) {
            const entryPrice =
                pendingEntry.side ===
                    "LONG"
                    ? executionCandle
                        .ask.open
                    : executionCandle
                        .bid.open;

            openPosition = {
                side:
                    pendingEntry.side,

                signalTime:
                    pendingEntry.signalTime,

                decisionTime:
                    pendingEntry.decisionTime,

                entryTime:
                    executionCandle.time,

                entryPrice,

                stopLoss:
                    resolveLevel({
                        level:
                            pendingEntry.stopLoss,

                        side:
                            pendingEntry.side,

                        entryPrice,
                        pipSize,

                        purpose:
                            "STOP_LOSS",
                    }),

                takeProfit:
                    resolveLevel({
                        level:
                            pendingEntry.takeProfit,

                        side:
                            pendingEntry.side,

                        entryPrice,
                        pipSize,

                        purpose:
                            "TAKE_PROFIT",
                    }),
            };

            pendingEntry = null;
        }

        /*
          SL / TP are now checked against
          the execution timeframe only.
        */
        if (openPosition) {
            let exitReason = null;
            let exitPrice = null;

            if (
                openPosition.side ===
                "LONG"
            ) {
                const stopHit =
                    executionCandle
                        .bid.low <=
                    openPosition.stopLoss;

                const takeProfitHit =
                    executionCandle
                        .bid.high >=
                    openPosition.takeProfit;

                /*
                  Conservative behaviour:
                  if both occurred within the
                  same execution candle, assume
                  stop happened first.
                */
                if (stopHit) {
                    exitReason =
                        "STOP_LOSS";

                    exitPrice =
                        openPosition.stopLoss;
                } else if (
                    takeProfitHit
                ) {
                    exitReason =
                        "TAKE_PROFIT";

                    exitPrice =
                        openPosition.takeProfit;
                }
            }

            if (
                openPosition.side ===
                "SHORT"
            ) {
                const stopHit =
                    executionCandle
                        .ask.high >=
                    openPosition.stopLoss;

                const takeProfitHit =
                    executionCandle
                        .ask.low <=
                    openPosition.takeProfit;

                if (stopHit) {
                    exitReason =
                        "STOP_LOSS";

                    exitPrice =
                        openPosition.stopLoss;
                } else if (
                    takeProfitHit
                ) {
                    exitReason =
                        "TAKE_PROFIT";

                    exitPrice =
                        openPosition.takeProfit;
                }
            }

            if (exitReason) {
                const pnlPips =
                    calculatePnlPips({
                        side:
                            openPosition.side,

                        entryPrice:
                            openPosition
                                .entryPrice,

                        exitPrice,

                        pipSize,
                    });

                trades.push({
                    ...openPosition,

                    exitTime:
                        executionCandle.time,

                    exitPrice,
                    exitReason,

                    pnlPips,

                    result:
                        pnlPips > 0
                            ? "WIN"
                            : pnlPips < 0
                                ? "LOSS"
                                : "BREAKEVEN",
                });

                openPosition = null;
            }
        }
    }

    return {
        processedStrategyCandles:
            strategyIndex,

        processedExecutionCandles:
            executionCandles.length,

        signals,
        trades,

        openPosition,
        pendingEntry,
    };
}