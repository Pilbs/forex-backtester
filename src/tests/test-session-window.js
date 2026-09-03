import { getSessionPhase } from "../time/session-window.js";

const session = {
  startHour: 8,
  startMinute: 15,
  durationMinutes: 60,
};

function phase(time) {
  return getSessionPhase({
    time: Date.parse(time),
    ...session,
  });
}

const before = phase(
  "2026-08-27T08:14:00Z"
);

const start = phase(
  "2026-08-27T08:15:00Z"
);

const lastCandle = phase(
  "2026-08-27T09:14:00Z"
);

const after = phase(
  "2026-08-27T09:15:00Z"
);

console.log("08:14:", before);
console.log("08:15:", start);
console.log("09:14:", lastCandle);
console.log("09:15:", after);

if (before !== "BEFORE") {
  throw new Error(
    `Expected BEFORE, received ${before}`
  );
}

if (start !== "IN_SESSION") {
  throw new Error(
    `Expected IN_SESSION at 08:15, received ${start}`
  );
}

if (lastCandle !== "IN_SESSION") {
  throw new Error(
    `Expected IN_SESSION at 09:14, received ${lastCandle}`
  );
}

if (after !== "AFTER") {
  throw new Error(
    `Expected AFTER at 09:15, received ${after}`
  );
}

console.log("");
console.log("Session window test passed.");