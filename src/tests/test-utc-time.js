import {
  getUtcDateKey,
  getUtcHour,
  getUtcMinute,
  getUtcMinutesSinceMidnight,
} from "../time/utc-time.js";

const time = Date.parse(
  "2026-08-27T08:15:00Z"
);

const dateKey = getUtcDateKey(time);
const hour = getUtcHour(time);
const minute = getUtcMinute(time);
const minutesSinceMidnight =
  getUtcMinutesSinceMidnight(time);

console.log("Date:", dateKey);
console.log("Hour:", hour);
console.log("Minute:", minute);
console.log(
  "Minutes since midnight:",
  minutesSinceMidnight
);

if (dateKey !== "2026-08-27") {
  throw new Error(
    `Unexpected date: ${dateKey}`
  );
}

if (hour !== 8) {
  throw new Error(
    `Unexpected hour: ${hour}`
  );
}

if (minute !== 15) {
  throw new Error(
    `Unexpected minute: ${minute}`
  );
}

if (minutesSinceMidnight !== 495) {
  throw new Error(
    `Expected 495, received ${minutesSinceMidnight}`
  );
}

console.log("");
console.log("UTC time helper test passed.");