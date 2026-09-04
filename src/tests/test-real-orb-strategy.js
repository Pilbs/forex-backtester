import "dotenv/config";

import {
  getCandles,
} from "../data/candle-reader.js";

import {
  runBacktest,
} from "../backtest/backtest-runner.js";

import {
  summarizeTrades,
} from "../backtest/backtest-summary.js";

import {
  createOrbStrategy,
} from "../strategies/orb/orb-strategy.js";

async function main() {
  console.log(
    "Loading real EUR/USD candles..."
  );

  const candles = await getCandles({
    instrument: "EUR_USD",
    granularity: "M1",
    from: "2026-08-24T00:00:00Z",
    to: "2026-08-29T00:00:00Z",
  });

  console.log(
    `Loaded ${candles.length} candles`
  );

  const strategy = createOrbStrategy({
    startHour: 8,
    startMinute: 15,
    durationMinutes: 60,
    timeZone: "America/New_York",

    // Temporary execution settings.
    // These are NOT yet meant to reproduce
    // the final Pine strategy.
    stopLossPips: 10,
    takeProfitPips: 20,
  });

  const result = runBacktest({
    candles,
    strategy,
  });

  console.log("");
  console.log("Signals");

  console.table(
    result.signals.map((signal) => ({
      timeUTC: new Date(
        signal.time
      ).toISOString(),

      action:
        signal.action,

      side:
        signal.side,

      rangeHigh:
        signal.metadata?.rangeHigh,

      rangeLow:
        signal.metadata?.rangeLow,
    }))
  );

  console.log("");
  console.log("Trades");

  console.table(
    result.trades.map((trade) => ({
      side: trade.side,

      entryUTC: new Date(
        trade.entryTime
      ).toISOString(),

      entryPrice:
        trade.entryPrice,

      exitUTC: new Date(
        trade.exitTime
      ).toISOString(),

      exitPrice:
        trade.exitPrice,

      reason:
        trade.exitReason,

      pnlPips:
        trade.pnlPips,

      result:
        trade.result,
    }))
  );

  console.log("");
  console.log("Summary");

  console.table([
    summarizeTrades(
      result.trades
    ),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});