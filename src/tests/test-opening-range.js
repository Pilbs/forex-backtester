import { createOpeningRange } from "../strategies/orb/opening-range.js";

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

const candles = [
  // BEFORE session - must be ignored.
  candle(
    "2026-08-27T08:14:00Z",
    1.5000,
    0.5000
  ),

  candle(
    "2026-08-27T08:15:00Z",
    1.1010,
    1.1000
  ),

  candle(
    "2026-08-27T08:16:00Z",
    1.1020,
    1.0995
  ),

  candle(
    "2026-08-27T09:14:00Z",
    1.1015,
    1.0990
  ),

  // AFTER session - must be ignored.
  candle(
    "2026-08-27T09:15:00Z",
    2.0000,
    0.1000
  ),
];

const openingRange = createOpeningRange({
  startHour: 8,
  startMinute: 15,
  durationMinutes: 60,
});

for (const candle of candles) {
  openingRange.onCandle(candle);
}

const range = openingRange.getState();

console.log("Range high:", range.high);
console.log("Range low:", range.low);
console.log("Candles used:", range.candleCount);

const rangePips = Number(
  ((range.high - range.low) * 10000).toFixed(1)
);

console.log("Range size:", `${rangePips} pips`);

if (range.high !== 1.1020) {
  throw new Error(
    `Expected high 1.1020, received ${range.high}`
  );
}

if (range.low !== 1.0990) {
  throw new Error(
    `Expected low 1.0990, received ${range.low}`
  );
}

if (range.candleCount !== 3) {
  throw new Error(
    `Expected 3 session candles, received ${range.candleCount}`
  );
}

if (rangePips !== 30) {
  throw new Error(
    `Expected 30 pips, received ${rangePips}`
  );
}

console.log("");
console.log("Opening range test passed.");