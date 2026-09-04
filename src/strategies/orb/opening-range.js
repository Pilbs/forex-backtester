import {
  getSessionPhase,
} from "../../time/session-window.js";

export function createOpeningRange({
  startHour,
  startMinute,
  durationMinutes,
  timeZone = "UTC",
}) {
  let high = null;
  let low = null;
  let candleCount = 0;
  let complete = false;

  function reset() {
    high = null;
    low = null;
    candleCount = 0;
    complete = false;
  }

  function onCandle(candle) {
    if (complete) {
      return;
    }

    const phase = getSessionPhase({
      time: candle.time,
      startHour,
      startMinute,
      durationMinutes,
      timeZone,
    });

    if (phase === "BEFORE") {
      return;
    }

    if (phase === "AFTER") {
      if (candleCount > 0) {
        complete = true;
      }

      return;
    }

    if (
      high === null ||
      candle.mid.high > high
    ) {
      high = candle.mid.high;
    }

    if (
      low === null ||
      candle.mid.low < low
    ) {
      low = candle.mid.low;
    }

    candleCount++;
  }

  function getState() {
    return {
      high,
      low,
      candleCount,
      complete,
    };
  }

  return {
    reset,
    onCandle,
    getState,
  };
}