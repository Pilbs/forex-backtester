import {
  createDailyOpeningRange,
} from "./daily-opening-range.js";

import {
  createBreakoutDetector,
} from "./breakout-detector.js";

export function createOrbStrategy({
  startHour = 8,
  startMinute = 15,
  durationMinutes = 60,
  timeZone = "America/New_York",
  stopLossPips,
  takeProfitPips,
}) {
  const dailyRange = createDailyOpeningRange({
    startHour,
    startMinute,
    durationMinutes,
    timeZone,
  });

  const breakoutDetector =
    createBreakoutDetector();

  function reset() {
    dailyRange.reset();
    breakoutDetector.reset();
  }

  function onCandle({ candle }) {
    dailyRange.onCandle(candle);

    const rangeState =
      dailyRange.getState();

    if (!rangeState.complete) {
      return null;
    }

    const breakout =
      breakoutDetector.onCandle({
        candle,
        rangeState,
      });

    if (!breakout) {
      return null;
    }

    if (breakout.direction === "BOTH") {
      return null;
    }

    return {
      action: "ENTER",

      side:
        breakout.direction === "ABOVE"
          ? "LONG"
          : "SHORT",

      stopLossPips,
      takeProfitPips,

      metadata: {
        strategy: "ORB",
        breakoutDirection:
          breakout.direction,
        rangeHigh:
          breakout.rangeHigh,
        rangeLow:
          breakout.rangeLow,
      },
    };
  }

  return {
    reset,
    onCandle,
  };
}