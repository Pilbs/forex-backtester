import { getUtcMinutesSinceMidnight } from "./utc-time.js";

export function getSessionPhase({
  time,
  startHour,
  startMinute,
  durationMinutes,
}) {
  const startMinutes =
    startHour * 60 + startMinute;

  const endMinutes =
    startMinutes + durationMinutes;

  if (endMinutes > 24 * 60) {
    throw new Error(
      "Sessions crossing midnight are not supported yet"
    );
  }

  const candleMinutes =
    getUtcMinutesSinceMidnight(time);

  if (candleMinutes < startMinutes) {
    return "BEFORE";
  }

  if (candleMinutes < endMinutes) {
    return "IN_SESSION";
  }

  return "AFTER";
}