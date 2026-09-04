import "dotenv/config";

import {
  runBacktestJob,
} from "../backtest/backtest-service.js";

import {
  createOrbStrategy,
} from "../strategies/orb/orb-strategy.js";

async function main() {
  const strategy =
    createOrbStrategy({
      startHour: 8,
      startMinute: 15,
      durationMinutes: 60,

      timeZone:
        "America/New_York",

      stopLossPips: 10,
      takeProfitPips: 20,
    });

  const result =
    await runBacktestJob({
      instrument:
        "EUR_USD",

      strategyTimeframe:
        "M5",

      executionTimeframe:
        "M5",

      from:
        "2026-08-01T00:00:00Z",

      to:
        "2026-09-01T00:00:00Z",

      strategy,
    });

  console.log("");
  console.log("Backtest");

  console.table([
    {
      instrument:
        result.config
          .instrument,

      strategyTimeframe:
        result.config
          .strategyTimeframe,

      executionTimeframe:
        result.config
          .executionTimeframe,

      candles:
        result.data
          .candleCount,

      trades:
        result.summary
          .totalTrades,

      wins:
        result.summary.wins,

      losses:
        result.summary
          .losses,

      winRate:
        result.summary
          .winRate,

      pnlPips:
        result.summary
          .totalPnlPips,
    },
  ]);

  console.log("");
  console.log("Trades");

  console.table(
    result.trades.map(
      (trade) => ({
        side:
          trade.side,

        entryUTC:
          new Date(
            trade.entryTime
          ).toISOString(),

        exitUTC:
          new Date(
            trade.exitTime
          ).toISOString(),

        reason:
          trade.exitReason,

        pnlPips:
          trade.pnlPips,

        result:
          trade.result,
      })
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});