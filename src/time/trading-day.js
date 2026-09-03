import { getUtcDateKey } from "./utc-time.js";

export function isNewTradingDay({
  previousTime,
  currentTime,
}) {
  // First candle is always the start of a trading day.
  if (previousTime === null) {
    return true;
  }

  return (
    getUtcDateKey(previousTime) !==
    getUtcDateKey(currentTime)
  );
}