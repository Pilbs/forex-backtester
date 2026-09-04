function getZonedParts(time, timeZone) {
  const date = new Date(time);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid time");
  }

  const formatter = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }
  );

  const parts = formatter.formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [
        part.type,
        part.value,
      ])
  );
}

export function getZonedDateKey(
  time,
  timeZone = "UTC"
) {
  const parts = getZonedParts(
    time,
    timeZone
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getZonedHour(
  time,
  timeZone = "UTC"
) {
  return Number(
    getZonedParts(time, timeZone).hour
  );
}

export function getZonedMinute(
  time,
  timeZone = "UTC"
) {
  return Number(
    getZonedParts(time, timeZone).minute
  );
}

export function getZonedMinutesSinceMidnight(
  time,
  timeZone = "UTC"
) {
  const parts = getZonedParts(
    time,
    timeZone
  );

  return (
    Number(parts.hour) * 60 +
    Number(parts.minute)
  );
}