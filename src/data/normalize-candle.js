function normalizePrice(price) {
  if (!price) {
    return null;
  }

  return {
    open: Number(price.o),
    high: Number(price.h),
    low: Number(price.l),
    close: Number(price.c),
  };
}

export function normalizeCandle(candle) {
  if (!candle?.time) {
    throw new Error("Candle is missing a time");
  }

  return {
    time: Date.parse(candle.time),
    complete: candle.complete,
    volume: Number(candle.volume),

    bid: normalizePrice(candle.bid),
    ask: normalizePrice(candle.ask),
    mid: normalizePrice(candle.mid),
  };
}

export function normalizeCandles(candles) {
  return candles
    .filter((candle) => candle.complete)
    .map(normalizeCandle);
}