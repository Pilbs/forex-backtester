import { isNewTradingDay } from "../time/trading-day.js";

const firstCandle = Date.parse(
  "2026-08-27T08:00:00Z"
);

const sameDay = Date.parse(
  "2026-08-27T15:00:00Z"
);

const endOfDay = Date.parse(
  "2026-08-27T23:59:00Z"
);

const nextDay = Date.parse(
  "2026-08-28T00:00:00Z"
);

const firstResult = isNewTradingDay({
  previousTime: null,
  currentTime: firstCandle,
});

const sameDayResult = isNewTradingDay({
  previousTime: firstCandle,
  currentTime: sameDay,
});

const nextDayResult = isNewTradingDay({
  previousTime: endOfDay,
  currentTime: nextDay,
});

console.log(
  "First candle:",
  firstResult
);

console.log(
  "Same day:",
  sameDayResult
);

console.log(
  "Next day:",
  nextDayResult
);

if (firstResult !== true) {
  throw new Error(
    "First candle should start a new trading day"
  );
}

if (sameDayResult !== false) {
  throw new Error(
    "Same-day candle incorrectly detected as new day"
  );
}

if (nextDayResult !== true) {
  throw new Error(
    "Next day was not detected"
  );
}

console.log("");
console.log("Trading day test passed.");