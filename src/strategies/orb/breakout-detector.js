export function createBreakoutDetector() {
  let currentDate = null;
  let breakout = null;

  function reset() {
    currentDate = null;
    breakout = null;
  }

  function onCandle({
    candle,
    rangeState,
  }) {
    if (!rangeState.complete) {
      return null;
    }

    if (
      currentDate !== rangeState.date
    ) {
      currentDate = rangeState.date;
      breakout = null;
    }

    if (breakout !== null) {
      return null;
    }

    const brokeAbove =
      candle.mid.high > rangeState.high;

    const brokeBelow =
      candle.mid.low < rangeState.low;

    if (!brokeAbove && !brokeBelow) {
      return null;
    }

    if (brokeAbove && brokeBelow) {
      breakout = {
        date: rangeState.date,
        time: candle.time,
        direction: "BOTH",
        rangeHigh: rangeState.high,
        rangeLow: rangeState.low,
        candleHigh: candle.mid.high,
        candleLow: candle.mid.low,
      };

      return breakout;
    }

    breakout = {
      date: rangeState.date,
      time: candle.time,
      direction:
        brokeAbove ? "ABOVE" : "BELOW",
      rangeHigh: rangeState.high,
      rangeLow: rangeState.low,
      candleHigh: candle.mid.high,
      candleLow: candle.mid.low,
    };

    return breakout;
  }

  function getState() {
    return breakout;
  }

  return {
    reset,
    onCandle,
    getState,
  };
}