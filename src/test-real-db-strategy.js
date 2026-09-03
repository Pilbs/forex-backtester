import "dotenv/config";

import { getCandles } from "./data/candle-reader.js";
import { runBacktest } from "./backtest/backtest-runner.js";
import { summarizeTrades } from "./backtest/backtest-summary.js";
import { threeUpStrategy } from "./strategies/three-up-strategy.js";

async function main() {
  console.log("Loading real EUR/USD candles from D1...");

  const candles = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",
    from: "2026-08-10T00:00:00Z",
    to: "2026-08-11T00:00:00Z",
  });

  console.log(`Loaded ${candles.length} candles`);

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
      stopLossPips: signal.stopLossPips,
      takeProfitPips: signal.takeProfitPips,
    }))
  );

  console.log("");
  console.log("Trades");

  console.table(
    result.trades.map((trade) => ({
      side: trade.side,

      signalTime: new Date(
        trade.signalTime
      ).toISOString(),

      entryTime: new Date(
        trade.entryTime
      ).toISOString(),

      entryPrice: trade.entryPrice,

      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,

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
  console.log("Candles:", candles.length);
  console.log("Signals:", result.signals.length);
  console.log("Trades:", summary.totalTrades);
  console.log("Wins:", summary.wins);
  console.log("Losses:", summary.losses);
  console.log("Win rate:", `${summary.winRate}%`);
  console.log("Total P&L:", `${summary.totalPnlPips} pips`);

  if (result.signals.length === 0) {
    throw new Error(
      "Strategy did not generate a signal"
    );
  }

  console.log("");
  console.log("Real D1 strategy test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});