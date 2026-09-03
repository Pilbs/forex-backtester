export function runBacktest({ candles }) {
  if (!Array.isArray(candles)) {
    throw new Error("candles must be an array");
  }

  if (candles.length === 0) {
    throw new Error("No candles supplied to backtest");
  }

  let previousTime = null;
  let processedCandles = 0;

  for (const candle of candles) {
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

    //
    // Later this is where the engine will:
    //
    // 1. update/check open position
    // 2. check SL / TP
    // 3. pass candle to strategy
    // 4. process strategy signal
    // 5. record trades
    //
    // For now we intentionally do nothing.
    //

    previousTime = candle.time;
    processedCandles++;
  }

  return {
    processedCandles,
    firstCandleTime: candles[0].time,
    lastCandleTime: candles[candles.length - 1].time,
  };
}