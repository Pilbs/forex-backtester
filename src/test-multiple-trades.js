import { runBacktest } from "./backtest/backtest-runner.js";
import { summarizeTrades } from "./backtest/backtest-summary.js";
import { multiTradeStrategy } from "./strategies/multi-trade-strategy.js";

function candle({
  time,
  bidOpen,
  bidHigh,
  bidLow,
  bidClose,
  askOpen,
  askHigh,
  askLow,
  askClose,
}) {
  return {
    time: Date.parse(time),
    complete: true,
    volume: 100,

    bid: {
      open: bidOpen,
      high: bidHigh,
      low: bidLow,
      close: bidClose,
    },

    ask: {
      open: askOpen,
      high: askHigh,
      low: askLow,
      close: askClose,
    },

    mid: {
      open: (bidOpen + askOpen) / 2,
      high: (bidHigh + askHigh) / 2,
      low: (bidLow + askLow) / 2,
      close: (bidClose + askClose) / 2,
    },
  };
}

const candles = [
  candle({
    time: "2026-01-01T10:00:00Z",
    bidOpen: 1.1000,
    bidHigh: 1.1002,
    bidLow: 1.0999,
    bidClose: 1.1001,
    askOpen: 1.1002,
    askHigh: 1.1004,
    askLow: 1.1001,
    askClose: 1.1003,
  }),

  // LONG enters here at ask open = 1.1002.
  // TP = 1.1007.
  // Bid high reaches 1.1008, so it wins.
  candle({
    time: "2026-01-01T10:01:00Z",
    bidOpen: 1.1000,
    bidHigh: 1.1008,
    bidLow: 1.0999,
    bidClose: 1.1007,
    askOpen: 1.1002,
    askHigh: 1.1010,
    askLow: 1.1001,
    askClose: 1.1009,
  }),

  candle({
    time: "2026-01-01T10:02:00Z",
    bidOpen: 1.1010,
    bidHigh: 1.1012,
    bidLow: 1.1008,
    bidClose: 1.1010,
    askOpen: 1.1012,
    askHigh: 1.1014,
    askLow: 1.1010,
    askClose: 1.1012,
  }),

  // SHORT enters here at bid open = 1.1010.
  // TP = 1.1005.
  // Ask low reaches 1.1004, so it wins.
  candle({
    time: "2026-01-01T10:03:00Z",
    bidOpen: 1.1010,
    bidHigh: 1.1011,
    bidLow: 1.1002,
    bidClose: 1.1004,
    askOpen: 1.1012,
    askHigh: 1.1013,
    askLow: 1.1004,
    askClose: 1.1006,
  }),
];

const result = runBacktest({
  candles,
  strategy: multiTradeStrategy,
});

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

const summary = summarizeTrades(result.trades);

console.log("");
console.log("Summary");
console.log("Trades:", summary.totalTrades);
console.log("Wins:", summary.wins);
console.log("Losses:", summary.losses);
console.log("Win rate:", `${summary.winRate}%`);
console.log("Total P&L:", `${summary.totalPnlPips} pips`);

if (result.trades.length !== 2) {
  throw new Error(
    `Expected 2 trades, received ${result.trades.length}`
  );
}

if (result.trades[0].side !== "LONG") {
  throw new Error("First trade should be LONG");
}

if (result.trades[1].side !== "SHORT") {
  throw new Error("Second trade should be SHORT");
}

if (result.trades[0].pnlPips !== 5) {
  throw new Error(
    `Expected first trade +5 pips, received ${result.trades[0].pnlPips}`
  );
}

if (result.trades[1].pnlPips !== 5) {
  throw new Error(
    `Expected second trade +5 pips, received ${result.trades[1].pnlPips}`
  );
}

console.log("");
console.log("Multiple trade test passed.");