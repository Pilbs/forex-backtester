import { runBacktest } from "./backtest/backtest-runner.js";
import { threeUpStrategy } from "./strategies/three-up-strategy.js";

function makeCandle({
  time,
  midClose,
  bidOpen,
  bidHigh,
  bidLow,
  askOpen,
}) {
  return {
    time: Date.parse(time),
    complete: true,
    volume: 100,

    mid: {
      open: midClose,
      high: midClose,
      low: midClose,
      close: midClose,
    },

    bid: {
      open: bidOpen,
      high: bidHigh,
      low: bidLow,
      close: bidOpen,
    },

    ask: {
      open: askOpen,
      high: askOpen,
      low: askOpen,
      close: askOpen,
    },
  };
}

const candles = [
  makeCandle({
    time: "2026-01-01T10:00:00Z",
    midClose: 1.1000,
    bidOpen: 1.0999,
    bidHigh: 1.1001,
    bidLow: 1.0998,
    askOpen: 1.1001,
  }),

  makeCandle({
    time: "2026-01-01T10:01:00Z",
    midClose: 1.1003,
    bidOpen: 1.1002,
    bidHigh: 1.1004,
    bidLow: 1.1001,
    askOpen: 1.1004,
  }),

  // Third higher close.
  // Strategy should signal LONG here.
  makeCandle({
    time: "2026-01-01T10:02:00Z",
    midClose: 1.1006,
    bidOpen: 1.1005,
    bidHigh: 1.1007,
    bidLow: 1.1004,
    askOpen: 1.1007,
  }),

  // LONG enters here at ASK open = 1.1008.
  // 5 pip TP = 1.1013.
  makeCandle({
    time: "2026-01-01T10:03:00Z",
    midClose: 1.1010,
    bidOpen: 1.1006,
    bidHigh: 1.1014,
    bidLow: 1.1005,
    askOpen: 1.1008,
  }),
];

const result = runBacktest({
  candles,
  strategy: threeUpStrategy,
});

console.log("");
console.log("Signals");

console.table(
  result.signals.map((signal) => ({
    time: new Date(signal.time).toISOString(),
    side: signal.side,
  }))
);

console.log("");
console.log("Trades");

console.table(
  result.trades.map((trade) => ({
    side: trade.side,
    entryTime: new Date(trade.entryTime).toISOString(),
    entryPrice: trade.entryPrice,
    exitTime: new Date(trade.exitTime).toISOString(),
    exitPrice: trade.exitPrice,
    pnlPips: trade.pnlPips,
    result: trade.result,
  }))
);

if (result.signals.length !== 1) {
  throw new Error(
    `Expected 1 signal, received ${result.signals.length}`
  );
}

if (
  result.signals[0].time !==
  candles[2].time
) {
  throw new Error(
    "Expected signal on third candle"
  );
}

if (result.trades.length !== 1) {
  throw new Error(
    `Expected 1 trade, received ${result.trades.length}`
  );
}

if (
  result.trades[0].entryTime !==
  candles[3].time
) {
  throw new Error(
    "Expected entry on candle after signal"
  );
}

if (result.trades[0].pnlPips !== 5) {
  throw new Error(
    `Expected +5 pips, received ${result.trades[0].pnlPips}`
  );
}

console.log("");
console.log("Multi-candle strategy test passed.");