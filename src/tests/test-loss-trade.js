import "dotenv/config";

import { getCandles } from "../data/candle-reader.js";
import { runBacktest } from "../backtest/backtest-runner.js";
import { summarizeTrades } from "../backtest/backtest-summary.js";
import { dumbLossStrategy } from "../strategies/dumb-loss-strategy.js";

async function main() {
  const candles = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",
    from: "2022-11-10T13:00:00Z",
    to: "2022-11-10T14:00:00Z",
  });

  const result = runBacktest({
    candles,
    strategy: dumbLossStrategy,
  });

  console.log("");
  console.log("Trades");

  console.table(
    result.trades.map((trade) => ({
      side: trade.side,
      entryTime: new Date(trade.entryTime).toISOString(),
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      exitTime: new Date(trade.exitTime).toISOString(),
      exitPrice: trade.exitPrice,
      exitReason: trade.exitReason,
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
  console.log("Total P&L:", `${summary.totalPnlPips} pips`);

  if (result.trades.length !== 1) {
    throw new Error(
      `Expected 1 trade, received ${result.trades.length}`
    );
  }

  const trade = result.trades[0];

  if (trade.side !== "SHORT") {
    throw new Error("Expected SHORT");
  }

  if (trade.exitReason !== "STOP_LOSS") {
    throw new Error(
      `Expected STOP_LOSS, received ${trade.exitReason}`
    );
  }

  if (trade.pnlPips !== -10) {
    throw new Error(
      `Expected -10 pips, received ${trade.pnlPips}`
    );
  }

  if (trade.result !== "LOSS") {
    throw new Error(
      `Expected LOSS, received ${trade.result}`
    );
  }

  console.log("");
  console.log("Loss trade validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});