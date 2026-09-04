import {
  runBacktest,
} from "../backtest/backtest-runner.js";

const M5 = 5 * 60 * 1000;
const M1 = 60 * 1000;

const start =
  Date.parse("2026-08-03T09:00:00Z");

function candle({
  time,
  bidOpen,
  bidHigh,
  bidLow,
  bidClose,
}) {
  const spread = 0.0001;

  return {
    time,
    complete: true,
    volume: 1,

    bid: {
      open: bidOpen,
      high: bidHigh,
      low: bidLow,
      close: bidClose,
    },

    ask: {
      open: bidOpen + spread,
      high: bidHigh + spread,
      low: bidLow + spread,
      close: bidClose + spread,
    },

    mid: {
      open: bidOpen + spread / 2,
      high: bidHigh + spread / 2,
      low: bidLow + spread / 2,
      close: bidClose + spread / 2,
    },
  };
}

const strategyCandles = [
  candle({
    time: start,
    bidOpen: 1.1000,
    bidHigh: 1.1005,
    bidLow: 1.0995,
    bidClose: 1.1000,
  }),
];

const m5ExecutionCandles = [
  candle({
    time: start + M5,
    bidOpen: 1.1000,

    // Both SL and TP occur somewhere
    // inside this M5 candle.
    bidHigh: 1.1015,
    bidLow: 1.0985,

    bidClose: 1.1000,
  }),
];

const m1ExecutionCandles = [
  candle({
    time: start + M5,
    bidOpen: 1.1000,

    // Price rises first.
    bidHigh: 1.1015,
    bidLow: 1.1000,
    bidClose: 1.1012,
  }),

  candle({
    time: start + M5 + M1,
    bidOpen: 1.1012,

    // Price falls afterwards,
    // but trade should already be closed.
    bidHigh: 1.1012,
    bidLow: 1.0985,
    bidClose: 1.0990,
  }),
];

function createStrategy() {
  let fired = false;

  return {
    name: "EXECUTION_TEST",

    reset() {
      fired = false;
    },

    onCandle() {
      if (fired) {
        return null;
      }

      fired = true;

      return {
        action: "ENTER",
        side: "LONG",

        stopLoss: {
          type: "PIPS",
          value: 10,
        },

        takeProfit: {
          type: "PIPS",
          value: 10,
        },
      };
    },
  };
}

const m5Result =
  runBacktest({
    strategyCandles,

    executionCandles:
      m5ExecutionCandles,

    strategy:
      createStrategy(),

    pipSize: 0.0001,

    instrument: "EUR_USD",

    strategyTimeframe: "M5",
    executionTimeframe: "M5",
  });

const m1Result =
  runBacktest({
    strategyCandles,

    executionCandles:
      m1ExecutionCandles,

    strategy:
      createStrategy(),

    pipSize: 0.0001,

    instrument: "EUR_USD",

    strategyTimeframe: "M5",
    executionTimeframe: "M1",
  });

console.log(
  "M5 execution:",
  m5Result.trades[0]
    ?.result,
  m5Result.trades[0]
    ?.exitReason
);

console.log(
  "M1 execution:",
  m1Result.trades[0]
    ?.result,
  m1Result.trades[0]
    ?.exitReason
);

if (
  m5Result.trades[0]
    ?.result !== "LOSS"
) {
  throw new Error(
    "Expected M5 execution to lose"
  );
}

if (
  m1Result.trades[0]
    ?.result !== "WIN"
) {
  throw new Error(
    "Expected M1 execution to win"
  );
}

console.log(
  "Execution timeframe test passed."
);