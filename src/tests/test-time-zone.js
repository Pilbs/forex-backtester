import {
  getZonedDateKey,
  getZonedHour,
  getZonedMinute,
} from "../time/zoned-time.js";

const timeZone = "America/New_York";

// August = daylight saving time.
// 12:15 UTC should be 08:15 New York.
const summer = Date.parse(
  "2026-08-27T12:15:00Z"
);

// January = standard time.
// 13:15 UTC should be 08:15 New York.
const winter = Date.parse(
  "2026-01-15T13:15:00Z"
);

console.log(
  "Summer:",
  getZonedDateKey(summer, timeZone),
  getZonedHour(summer, timeZone),
  getZonedMinute(summer, timeZone)
);

console.log(
  "Winter:",
  getZonedDateKey(winter, timeZone),
  getZonedHour(winter, timeZone),
  getZonedMinute(winter, timeZone)
);

if (
  getZonedHour(summer, timeZone) !== 8 ||
  getZonedMinute(summer, timeZone) !== 15
) {
  throw new Error(
    "Summer New York conversion failed"
  );
}

if (
  getZonedHour(winter, timeZone) !== 8 ||
  getZonedMinute(winter, timeZone) !== 15
) {
  throw new Error(
    "Winter New York conversion failed"
  );
}

console.log("");
console.log(
  "New York DST handling test passed."
);