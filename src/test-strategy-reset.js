import { runBacktest } from "./backtest/backtest-runner.js";

const candles = [
  {
    time: Date.parse("2026-01-01T10:00:00Z"),
    bid: { open: 1, high: 1, low: 1, close: 1 },
    ask: { open: 1, high: 1, low: 1, close: 1 },
    mid: { open: 1, high: 1, low: 1, close: 1 },
  },
  {
    time: Date.parse("2026-01-01T10:01:00Z"),
    bid: { open: 1, high: 1, low: 1, close: 1 },
    ask: { open: 1, high: 1, low: 1, close: 1 },
    mid: { open: 1, high: 1, low: 1, close: 1 },
  },
];

let resetCalls = 0;
let candleCalls = 0;

const testStrategy = {
  reset() {
    resetCalls++;
    candleCalls = 0;
  },

  onCandle() {
    candleCalls++;
    return null;
  },
};

runBacktest({
  candles,
  strategy: testStrategy,
});

if (resetCalls !== 1) {
  throw new Error(
    `Expected reset once, received ${resetCalls}`
  );
}

if (candleCalls !== 2) {
  throw new Error(
    `Expected 2 candle calls, received ${candleCalls}`
  );
}

console.log("Reset calls:", resetCalls);
console.log("Candle calls:", candleCalls);
console.log("");
console.log("Strategy reset test passed.");