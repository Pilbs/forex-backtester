import { createOpeningRange } from "./strategies/opening-range.js";

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

const openingRange = createOpeningRange({
  startHour: 8,
  startMinute: 15,
  durationMinutes: 60,
});

// Build the range.
openingRange.onCandle(
  candle(
    "2026-08-27T08:15:00Z",
    1.1010,
    1.1000
  )
);

openingRange.onCandle(
  candle(
    "2026-08-27T08:30:00Z",
    1.1020,
    1.0990
  )
);

openingRange.onCandle(
  candle(
    "2026-08-27T09:14:00Z",
    1.1015,
    1.0995
  )
);

const beforeFreeze =
  openingRange.getState();

console.log("Before 09:15:");
console.log(beforeFreeze);

if (beforeFreeze.complete !== false) {
  throw new Error(
    "Range should not be complete before 09:15"
  );
}

// 09:15 marks the range complete.
openingRange.onCandle(
  candle(
    "2026-08-27T09:15:00Z",
    1.5000,
    0.5000
  )
);

const frozen =
  openingRange.getState();

console.log("");
console.log("At 09:15:");
console.log(frozen);

if (frozen.complete !== true) {
  throw new Error(
    "Range should be complete at 09:15"
  );
}

if (frozen.high !== 1.1020) {
  throw new Error(
    `Expected high 1.1020, received ${frozen.high}`
  );
}

if (frozen.low !== 1.0990) {
  throw new Error(
    `Expected low 1.0990, received ${frozen.low}`
  );
}

// Extreme later candle.
// This MUST NOT change the frozen range.
openingRange.onCandle(
  candle(
    "2026-08-27T10:00:00Z",
    2.0000,
    0.1000
  )
);

const afterFreeze =
  openingRange.getState();

console.log("");
console.log("After later candle:");
console.log(afterFreeze);

if (afterFreeze.high !== frozen.high) {
  throw new Error(
    "Frozen range high changed"
  );
}

if (afterFreeze.low !== frozen.low) {
  throw new Error(
    "Frozen range low changed"
  );
}

if (
  afterFreeze.candleCount !==
  frozen.candleCount
) {
  throw new Error(
    "Frozen range candle count changed"
  );
}

console.log("");
console.log("Opening range freeze test passed.");