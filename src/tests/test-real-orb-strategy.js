import "dotenv/config";

import { runBacktestJob } from "../backtest/backtest-service.js";
import { createOrbStrategy } from "../strategies/orb/orb-strategy.js";

async function main() {
    const strategyConfig = {
        orbStartHour: 8,
        orbStartMinute: 15,
        orbDurationMinutes: 60,
        timezoneMode: "EXCHANGE",
        breakoutCondition: "CLOSE",
        requiredRetests: 1,
        breakoutDistanceEntryEnabled: false,
        breakoutDistanceMode: "ATR",
        breakoutDistanceValue: 1,
        maxOrbRangeEnabled: false,
        atrLength: 12,
        stopLossMode: "PERCENT",
        stopLossValue: 0.20,
        takeProfitMode: "ATR",
        takeProfitValue: 3,
        tpProgressEnabled: false,
        closeAtNextORB: true,
        latestEntryEnabled: true,
        latestEntryHour: 12,
        latestEntryMinute: 15,
        skipFridayEntries: false,
        profitExitWindowEnabled: false,
    };

    const strategy = createOrbStrategy(strategyConfig);

    const result = await runBacktestJob({
        instrument: "EUR_USD",
        strategyTimeframe: "M5",
        executionTimeframe: "M5",
        from: "2026-08-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
        strategy,
    });

    console.log("");
    console.log("Backtest");
    console.table([{
        instrument: result.config.instrument,
        strategyTimeframe: result.config.strategyTimeframe,
        executionTimeframe: result.config.executionTimeframe,
        strategyCandles: result.data.strategyCandleCount,
        executionCandles: result.data.executionCandleCount,
        trades: result.summary.totalTrades,
        wins: result.summary.wins,
        losses: result.summary.losses,
        winRate: result.summary.winRate,
        pnlPips: result.summary.totalPnlPips,
    }]);

    console.log("");
    console.log("Trades");
    console.table(result.trades.map((trade) => ({
        side: trade.side,
        entryUTC: new Date(trade.entryTime).toISOString(),
        exitUTC: new Date(trade.exitTime).toISOString(),
        reason: trade.exitReason,
        pnlPips: trade.pnlPips,
        result: trade.result,
    })));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
