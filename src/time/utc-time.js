export function getUtcDateKey(time) {
  const date = new Date(time);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid time");
  }

  return date.toISOString().slice(0, 10);
}

export function getUtcHour(time) {
  const date = new Date(time);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid time");
  }

  return date.getUTCHours();
}

export function getUtcMinute(time) {
  const date = new Date(time);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid time");
  }

  return date.getUTCMinutes();
}

export function getUtcMinutesSinceMidnight(time) {
  return (
    getUtcHour(time) * 60 +
    getUtcMinute(time)
  );
}