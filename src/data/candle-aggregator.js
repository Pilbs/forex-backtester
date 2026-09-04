const MINUTE_MS = 60 * 1000;

function aggregatePrice(candles, priceType) {
  const first = candles[0][priceType];
  const last =
    candles[candles.length - 1][priceType];

  return {
    open: first.open,

    high: Math.max(
      ...candles.map(
        (candle) =>
          candle[priceType].high
      )
    ),

    low: Math.min(
      ...candles.map(
        (candle) =>
          candle[priceType].low
      )
    ),

    close: last.close,
  };
}

export function aggregateCandles({
  candles,
  sourceMinutes = 1,
  targetMinutes,
}) {
  if (!Array.isArray(candles)) {
    throw new Error(
      "candles must be an array"
    );
  }

  if (
    !Number.isInteger(sourceMinutes) ||
    sourceMinutes <= 0
  ) {
    throw new Error(
      "sourceMinutes must be a positive integer"
    );
  }

  if (
    !Number.isInteger(targetMinutes) ||
    targetMinutes <= sourceMinutes
  ) {
    throw new Error(
      "targetMinutes must be greater than sourceMinutes"
    );
  }

  if (
    targetMinutes % sourceMinutes !== 0
  ) {
    throw new Error(
      "targetMinutes must be a multiple of sourceMinutes"
    );
  }

  const sourceMs =
    sourceMinutes * MINUTE_MS;

  const targetMs =
    targetMinutes * MINUTE_MS;

  const expectedCandles =
    targetMinutes / sourceMinutes;

  const result = [];

  let bucketStart = null;
  let bucket = [];
  let previousTime = null;

  function finishBucket() {
    if (
      bucketStart === null ||
      bucket.length !== expectedCandles
    ) {
      return;
    }

    // Make sure there are no missing
    // candles inside the bucket.
    for (
      let index = 0;
      index < bucket.length;
      index++
    ) {
      const expectedTime =
        bucketStart +
        index * sourceMs;

      if (
        bucket[index].time !==
        expectedTime
      ) {
        return;
      }
    }

    result.push({
      time: bucketStart,
      complete: true,

      volume: bucket.reduce(
        (total, candle) =>
          total + candle.volume,
        0
      ),

      bid: aggregatePrice(
        bucket,
        "bid"
      ),

      ask: aggregatePrice(
        bucket,
        "ask"
      ),

      mid: aggregatePrice(
        bucket,
        "mid"
      ),
    });
  }

  for (const candle of candles) {
    if (!Number.isFinite(candle.time)) {
      throw new Error(
        "Candle has invalid time"
      );
    }

    if (
      previousTime !== null &&
      candle.time <= previousTime
    ) {
      throw new Error(
        "Candles must be chronological"
      );
    }

    const candleBucketStart =
      Math.floor(
        candle.time / targetMs
      ) * targetMs;

    if (bucketStart === null) {
      bucketStart =
        candleBucketStart;
    }

    if (
      candleBucketStart !==
      bucketStart
    ) {
      finishBucket();

      bucket = [];
      bucketStart =
        candleBucketStart;
    }

    bucket.push(candle);

    previousTime = candle.time;
  }

  finishBucket();

  return result;
}