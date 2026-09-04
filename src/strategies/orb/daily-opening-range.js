import {
  getZonedDateKey,
} from "../../time/zoned-time.js";

import {
  createOpeningRange,
} from "./opening-range.js";

export function createDailyOpeningRange({
  startHour,
  startMinute,
  durationMinutes,
  timeZone = "UTC",
}) {
  const openingRange = createOpeningRange({
    startHour,
    startMinute,
    durationMinutes,
    timeZone,
  });

  let currentDateKey = null;

  function reset() {
    currentDateKey = null;
    openingRange.reset();
  }

  function onCandle(candle) {
    const candleDateKey =
      getZonedDateKey(
        candle.time,
        timeZone
      );

    if (
      currentDateKey !==
      candleDateKey
    ) {
      currentDateKey =
        candleDateKey;

      openingRange.reset();
    }

    openingRange.onCandle(candle);
  }

  function getState() {
    return {
      date: currentDateKey,
      ...openingRange.getState(),
    };
  }

  return {
    reset,
    onCandle,
    getState,
  };
}