import { getSessionPhase } from "../../time/session-window.js";

export function createOpeningRange({
  startHour,
  startMinute,
  durationMinutes,
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
    // Once complete, nothing can change the range.
    if (complete) {
      return;
    }

    const phase = getSessionPhase({
      time: candle.time,
      startHour,
      startMinute,
      durationMinutes,
    });

    if (phase === "BEFORE") {
      return;
    }

    if (phase === "AFTER") {
      complete = true;
      return;
    }

    // IN_SESSION
    if (high === null || candle.mid.high > high) {
      high = candle.mid.high;
    }

    if (low === null || candle.mid.low < low) {
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