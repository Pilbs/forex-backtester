import {
    summarizeTrades,
    summarizeTradesByYear,
} from "../backtest/backtest-summary.js";

const trades = [
    {
        side: "LONG",
        entryTime: Date.parse("2024-01-02T10:00:00Z"),
        pnlPips: 10,
    },
    {
        side: "SHORT",
        entryTime: Date.parse("2024-02-02T10:00:00Z"),
        pnlPips: -5,
    },
    {
        side: "LONG",
        entryTime: Date.parse("2025-01-02T10:00:00Z"),
        pnlPips: 20,
    },
    {
        side: "SHORT",
        entryTime: Date.parse("2025-02-02T10:00:00Z"),
        pnlPips: -10,
    },
];

const summary = summarizeTrades(trades);

if (summary.totalTrades !== 4) {
    throw new Error("Trade count is incorrect");
}

if (summary.totalPnlPips !== 15 || summary.profitFactor !== 2) {
    throw new Error("PnL or profit factor is incorrect");
}

if (summary.maxDrawdownPips !== 10 || summary.expectancyPips !== 3.75) {
    throw new Error("Drawdown or expectancy is incorrect");
}

const yearly = summarizeTradesByYear(trades);

if (yearly.length !== 2 || yearly[0].year !== 2024 || yearly[1].year !== 2025) {
    throw new Error("Yearly summary is incorrect");
}

console.log("Backtest summary test passed.");
