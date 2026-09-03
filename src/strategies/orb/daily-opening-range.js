import { getUtcDateKey } from "../../time/utc-time.js";
import { createOpeningRange } from "./opening-range.js";
export function createDailyOpeningRange({
  startHour,
  startMinute,
  durationMinutes,
}) {
  const openingRange = createOpeningRange({
    startHour,
    startMinute,
    durationMinutes,
  });

  let currentDateKey = null;

  function reset() {
    currentDateKey = null;
    openingRange.reset();
  }

  function onCandle(candle) {
    const candleDateKey =
      getUtcDateKey(candle.time);

    if (currentDateKey !== candleDateKey) {
      currentDateKey = candleDateKey;
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