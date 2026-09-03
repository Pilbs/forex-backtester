import { createDailyOpeningRange } from "./strategies/daily-opening-range.js";

function candle(time, high, low) {
  return {
    time: Date.parse(time),

    mid: {
      open: low,
      high,
      low,
      close: high,
    },
  };
}

const dailyRange = createDailyOpeningRange({
  startHour: 8,
  startMinute: 15,
  durationMinutes: 60,
});

// DAY 1
dailyRange.onCandle(
  candle(
    "2026-08-27T08:15:00Z",
    1.1010,
    1.1000
  )
);

dailyRange.onCandle(
  candle(
    "2026-08-27T08:30:00Z",
    1.1030,
    1.0990
  )
);

dailyRange.onCandle(
  candle(
    "2026-08-27T09:15:00Z",
    9,
    9
  )
);

const day1 = dailyRange.getState();

console.log("Day 1");
console.log(day1);

if (day1.date !== "2026-08-27") {
  throw new Error("Unexpected Day 1 date");
}

if (day1.high !== 1.1030) {
  throw new Error(
    `Unexpected Day 1 high: ${day1.high}`
  );
}

if (day1.low !== 1.0990) {
  throw new Error(
    `Unexpected Day 1 low: ${day1.low}`
  );
}

if (day1.complete !== true) {
  throw new Error(
    "Day 1 range should be complete"
  );
}

// DAY 2
dailyRange.onCandle(
  candle(
    "2026-08-28T08:15:00Z",
    1.2010,
    1.2000
  )
);

dailyRange.onCandle(
  candle(
    "2026-08-28T08:45:00Z",
    1.2020,
    1.1980
  )
);

dailyRange.onCandle(
  candle(
    "2026-08-28T09:15:00Z",
    9,
    9
  )
);

const day2 = dailyRange.getState();

console.log("");
console.log("Day 2");
console.log(day2);

if (day2.date !== "2026-08-28") {
  throw new Error("Unexpected Day 2 date");
}

if (day2.high !== 1.2020) {
  throw new Error(
    `Unexpected Day 2 high: ${day2.high}`
  );
}

if (day2.low !== 1.1980) {
  throw new Error(
    `Unexpected Day 2 low: ${day2.low}`
  );
}

if (day2.complete !== true) {
  throw new Error(
    "Day 2 range should be complete"
  );
}

if (day2.high === day1.high) {
  throw new Error(
    "Day 2 reused Day 1 range"
  );
}

console.log("");
console.log("Daily opening range test passed.");