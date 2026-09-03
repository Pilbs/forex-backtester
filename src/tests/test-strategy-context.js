import { createStrategyContext } from "../backtest/strategy-context.js";

const candles = [
  {
    time: Date.parse("2026-01-01T10:00:00Z"),
    mid: { close: 1.1000 },
  },
  {
    time: Date.parse("2026-01-01T10:01:00Z"),
    mid: { close: 1.1010 },
  },
  {
    time: Date.parse("2026-01-01T10:02:00Z"),
    mid: { close: 1.1020 },
  },
  {
    time: Date.parse("2026-01-01T10:03:00Z"),
    mid: { close: 1.1030 },
  },
];

const context = createStrategyContext({
  candles,
  index: 2,
});

console.log(
  "Current:",
  context.candle.mid.close
);

console.log(
  "Previous:",
  context.getCandle(-1).mid.close
);

console.log(
  "Two candles ago:",
  context.getCandle(-2).mid.close
);

console.log(
  "Recent 3:",
  context
    .getRecentCandles(3)
    .map((candle) => candle.mid.close)
);

if (context.candle.mid.close !== 1.1020) {
  throw new Error("Current candle incorrect");
}

if (
  context.getCandle(-1).mid.close !== 1.1010
) {
  throw new Error("Previous candle incorrect");
}

const recent = context.getRecentCandles(3);

if (recent.length !== 3) {
  throw new Error("Expected 3 recent candles");
}

let futureBlocked = false;

try {
  context.getCandle(1);
} catch {
  futureBlocked = true;
}

if (!futureBlocked) {
  throw new Error(
    "Strategy was able to access a future candle"
  );
}

console.log("");
console.log("Strategy context test passed.");