import "dotenv/config";

import { getCandles } from "../data/candle-reader.js";
import { runBacktest } from "../backtest/backtest-runner.js";
import { summarizeTrades } from "../backtest/backtest-summary.js";
import { threeUpStrategy } from "../strategies/three-up-strategy.js";

async function main() {
  console.log("Loading candles from D1...");

  const candles = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",

    // Change these if you want a larger test.
    from: "2022-11-01T00:00:00Z",
    to: "2022-12-01T00:00:00Z",
  });

  console.log(`Loaded ${candles.length} candles`);

  console.log("");
  console.log("Running backtest 1...");

  const result1 = runBacktest({
    candles,
    strategy: threeUpStrategy,
  });

  console.log("Running backtest 2...");

  const result2 = runBacktest({
    candles,
    strategy: threeUpStrategy,
  });

  const summary1 = summarizeTrades(result1.trades);
  const summary2 = summarizeTrades(result2.trades);

  console.log("");
  console.log("Run 1");
  console.table([summary1]);

  console.log("Run 2");
  console.table([summary2]);

  // Compare the complete signal lists.
  const signalsMatch =
    JSON.stringify(result1.signals) ===
    JSON.stringify(result2.signals);

  // Compare the complete trade lists.
  const tradesMatch =
    JSON.stringify(result1.trades) ===
    JSON.stringify(result2.trades);

  // Compare summaries.
  const summariesMatch =
    JSON.stringify(summary1) ===
    JSON.stringify(summary2);

  if (!signalsMatch) {
    throw new Error(
      "Signal results differ between runs"
    );
  }

  if (!tradesMatch) {
    throw new Error(
      "Trade results differ between runs"
    );
  }

  if (!summariesMatch) {
    throw new Error(
      "Summary results differ between runs"
    );
  }

  console.log("");
  console.log("Signals identical: YES");
  console.log("Trades identical: YES");
  console.log("Summary identical: YES");

  console.log("");
  console.log("Repeatability test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});