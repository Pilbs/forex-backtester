import "dotenv/config";
import {  runBacktestJob,} from "../backtest/backtest-service.js";
import {  createOrbStrategy,} from "../strategies/orb/orb-strategy.js";
import {  runParameterSweep,} from "../research/parameter-sweep.js";

async function main() {
  const baseStrategyConfig = {
    startHour: 8,
    startMinute: 15,
    durationMinutes: 60,
    timeZone: "America/New_York",
    stopLossPips: 10,
    takeProfitPips: 20,
  };

  const sweepResults =
    await runParameterSweep({
      strategyFactory: createOrbStrategy,
      baseStrategyConfig,
      parameterName:
        "takeProfitPips",
      values: [
        10,
        15,
        20,
        25,
        30,
      ],

      executeRun: async ({strategy,}) =>
        runBacktestJob({
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
        }),
    });

  console.table(
    sweepResults.map(
      ({
        parameterValue,
        result,
      }) => ({
        takeProfitPips:
          parameterValue,

        trades:
          result.summary
            .totalTrades,

        wins:
          result.summary.wins,

        losses:
          result.summary.losses,

        winRate:
          result.summary.winRate,

        pnlPips:
          result.summary
            .totalPnlPips,
      })
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});