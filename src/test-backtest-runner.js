import "dotenv/config";

import { getCandles } from "./data/candle-reader.js";
import { runBacktest } from "./backtest/backtest-runner.js";
import { summarizeTrades } from "./backtest/backtest-summary.js";
import { dumbTestStrategy } from "./strategies/dumb-test-strategy.js";

async function main() {
  const candles = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",
    from: "2022-11-10T13:00:00Z",
    to: "2022-11-10T14:00:00Z",
  });

  const result = runBacktest({
    candles,
    strategy: dumbTestStrategy,
  });

  console.log("");
  console.log("Trades");

  console.table(
    result.trades.map((trade) => ({
      side: trade.side,

      entryTime: new Date(
        trade.entryTime
      ).toISOString(),

      entryPrice: trade.entryPrice,

      exitTime: new Date(
        trade.exitTime
      ).toISOString(),

      exitPrice: trade.exitPrice,

      exitReason: trade.exitReason,

      pnlPips: trade.pnlPips,

      result: trade.result,
    }))
  );

  const summary = summarizeTrades(result.trades);

  console.log("");
  console.log("Backtest Summary");
  console.log("----------------");
  console.log("Trades:", summary.totalTrades);
  console.log("Wins:", summary.wins);
  console.log("Losses:", summary.losses);
  console.log("Breakeven:", summary.breakeven);
  console.log("Win rate:", `${summary.winRate}%`);
  console.log("Total P&L:", `${summary.totalPnlPips} pips`);

  if (summary.totalTrades !== 1) {
    throw new Error(
      `Expected 1 trade, received ${summary.totalTrades}`
    );
  }

  if (summary.wins !== 1) {
    throw new Error(
      `Expected 1 win, received ${summary.wins}`
    );
  }

  if (summary.losses !== 0) {
    throw new Error(
      `Expected 0 losses, received ${summary.losses}`
    );
  }

  if (summary.winRate !== 100) {
    throw new Error(
      `Expected 100% win rate, received ${summary.winRate}%`
    );
  }

  if (summary.totalPnlPips !== 20) {
    throw new Error(
      `Expected 20 pips, received ${summary.totalPnlPips}`
    );
  }

  console.log("");
  console.log("Backtest summary test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});