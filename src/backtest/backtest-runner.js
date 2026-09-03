import { validateStrategy } from "../strategies/strategy-interface.js";

const PIP_SIZE = 0.0001;

function calculatePnlPips({
  side,
  entryPrice,
  exitPrice,
}) {
  const priceDifference =
    side === "LONG"
      ? exitPrice - entryPrice
      : entryPrice - exitPrice;

  return Number(
    (priceDifference / PIP_SIZE).toFixed(1)
  );
}

export function runBacktest({
  candles,
  strategy,
}) {
  if (!Array.isArray(candles)) {
    throw new Error("candles must be an array");
  }

  if (candles.length === 0) {
    throw new Error("No candles supplied to backtest");
  }

  validateStrategy(strategy);

  let previousTime = null;
  let processedCandles = 0;

  let pendingEntry = null;
  let openPosition = null;

  const signals = [];
  const trades = [];

  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index];

    if (!Number.isFinite(candle.time)) {
      throw new Error("Candle has invalid time");
    }

    if (
      previousTime !== null &&
      candle.time <= previousTime
    ) {
      throw new Error(
        `Candles are not chronological at ${new Date(
          candle.time
        ).toISOString()}`
      );
    }

    // Execute pending entry at this candle's open.
    if (pendingEntry && !openPosition) {
      const entryPrice =
        pendingEntry.side === "LONG"
          ? candle.ask.open
          : candle.bid.open;

      const direction =
        pendingEntry.side === "LONG"
          ? 1
          : -1;

      openPosition = {
        side: pendingEntry.side,

        signalTime: pendingEntry.signalTime,
        entryTime: candle.time,
        entryPrice,

        stopLoss:
          entryPrice -
          direction *
            pendingEntry.stopLossPips *
            PIP_SIZE,

        takeProfit:
          entryPrice +
          direction *
            pendingEntry.takeProfitPips *
            PIP_SIZE,
      };

      pendingEntry = null;
    }

    // Check SL / TP.
    if (openPosition) {
      let exitReason = null;
      let exitPrice = null;

      if (openPosition.side === "LONG") {
        const stopHit =
          candle.bid.low <= openPosition.stopLoss;

        const takeProfitHit =
          candle.bid.high >= openPosition.takeProfit;

        if (stopHit) {
          exitReason = "STOP_LOSS";
          exitPrice = openPosition.stopLoss;
        } else if (takeProfitHit) {
          exitReason = "TAKE_PROFIT";
          exitPrice = openPosition.takeProfit;
        }
      }

      if (openPosition.side === "SHORT") {
        const stopHit =
          candle.ask.high >= openPosition.stopLoss;

        const takeProfitHit =
          candle.ask.low <= openPosition.takeProfit;

        if (stopHit) {
          exitReason = "STOP_LOSS";
          exitPrice = openPosition.stopLoss;
        } else if (takeProfitHit) {
          exitReason = "TAKE_PROFIT";
          exitPrice = openPosition.takeProfit;
        }
      }

      if (exitReason) {
        const pnlPips = calculatePnlPips({
          side: openPosition.side,
          entryPrice: openPosition.entryPrice,
          exitPrice,
        });

        trades.push({
          ...openPosition,

          exitTime: candle.time,
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

    // Ask strategy what it wants to do.
    const signal = strategy.onCandle({
      candle,
      index,
    });

    if (signal) {
      signals.push({
        time: candle.time,
        index,
        ...signal,
      });

      if (
        signal.action === "ENTER" &&
        !openPosition &&
        !pendingEntry
      ) {
        pendingEntry = {
          side: signal.side,
          signalTime: candle.time,

          stopLossPips: signal.stopLossPips,
          takeProfitPips: signal.takeProfitPips,
        };
      }
    }

    previousTime = candle.time;
    processedCandles++;
  }

  return {
    processedCandles,

    firstCandleTime: candles[0].time,
    lastCandleTime: candles[candles.length - 1].time,

    signals,
    trades,

    openPosition,
  };
}