export function createStrategyContext({
  candles,
  index,
  instrument,
  timeframe,
}) {
  const candle = candles[index];

  function getCandle(offset = 0) {
    if (offset > 0) {
      throw new Error(
        "Strategies cannot access future candles"
      );
    }

    const targetIndex = index + offset;

    if (targetIndex < 0) {
      return null;
    }

    return candles[targetIndex];
  }

  function getRecentCandles(count) {
    if (
      !Number.isInteger(count) ||
      count <= 0
    ) {
      throw new Error(
        "count must be a positive integer"
      );
    }

    const startIndex = Math.max(
      0,
      index - count + 1
    );

    return candles.slice(
      startIndex,
      index + 1
    );
  }

  return {
    candle,
    index,

    instrument,
    timeframe,

    getCandle,
    getRecentCandles,
  };
}