import {
    summarizeBacktestResult,
    summarizeTrades,
    summarizeTradesByMonth,
    summarizeTradesByYear,
} from "../backtest/backtest-summary.js";

const trades = [
    {
        side: "LONG",
        entryTime: Date.parse("2024-01-02T10:00:00Z"),
        pnlPips: 10,
        pnlAccount: 100,
        result: "WIN",
        holdingMinutes: 30,
        mfePips: 15,
        maePips: 4,
    },
    {
        side: "SHORT",
        entryTime: Date.parse("2024-02-02T10:00:00Z"),
        pnlPips: -5,
        pnlAccount: -50,
        result: "LOSS",
        holdingMinutes: 60,
        mfePips: 3,
        maePips: 8,
    },
    {
        side: "LONG",
        entryTime: Date.parse("2025-01-02T10:00:00Z"),
        pnlPips: 20,
        pnlAccount: 200,
        result: "WIN",
        holdingMinutes: 45,
        mfePips: 25,
        maePips: 2,
    },
    {
        side: "SHORT",
        entryTime: Date.parse("2025-02-02T10:00:00Z"),
        pnlPips: -10,
        pnlAccount: -100,
        result: "LOSS",
        holdingMinutes: 45,
        mfePips: 0,
        maePips: 12,
    },
];

const summary = summarizeTrades(trades);

if (summary.totalTrades !== 4) {
    throw new Error("Trade count is incorrect");
}

if (summary.totalPnlPips !== 15 || summary.profitFactor !== 2) {
    throw new Error("Pip PnL or profit factor is incorrect");
}

if (summary.totalPnlAccount !== 150 || summary.profitFactorAccount !== 2) {
    throw new Error("Account PnL or profit factor is incorrect");
}

if (summary.maxDrawdownPips !== 10 || summary.expectancyPips !== 3.75) {
    throw new Error("Pip drawdown or expectancy is incorrect");
}

if (summary.closedTradeMaxDrawdownAccount !== 100 || summary.expectancyAccount !== 37.5) {
    throw new Error("Account drawdown or expectancy is incorrect");
}

if (
    summary.averageHoldingMinutes !== 45 ||
    summary.averageMfePips !== 10.75 ||
    summary.averageMaePips !== 6.5
) {
    throw new Error("Trade diagnostic averages are incorrect");
}

if (
    summary.losingTradesWithPositiveExcursion !== 1 ||
    summary.losingTradesWithPositiveExcursionPercent !== 50
) {
    throw new Error("Losing-trade excursion analysis is incorrect");
}

const yearly = summarizeTradesByYear(trades);

if (yearly.length !== 2 || yearly[0].year !== 2024 || yearly[1].year !== 2025) {
    throw new Error("Yearly summary is incorrect");
}

const monthly = summarizeTradesByMonth(trades);

if (monthly.length !== 4 || monthly[0].month !== "2024-01") {
    throw new Error("Monthly summary is incorrect");
}

const backtestSummary = summarizeBacktestResult({
    trades,
    openTrades: [],
    pendingOrders: [],
    rejectedOrders: [{ reason: "TEST" }],
    riskEvents: [{ type: "TEST" }],

    account: {
        currency: "USD",
        initialCapital: 10000,
        balance: 10150,
        equity: 10150,
        realizedPnl: 150,
        unrealizedPnl: 0,
        totalCommission: 10,
        maxDrawdownAccount: 120,
        maxDrawdownPercent: 1.2,
        halted: false,
        haltReason: null,
        position: {
            openTradeCount: 0,
        },
    },
});

if (backtestSummary.netPnlAccount !== 150 || backtestSummary.returnPercent !== 1.5) {
    throw new Error("Backtest account return is incorrect");
}

if (
    backtestSummary.maxDrawdownPercent !== 1.2 ||
    backtestSummary.rejectedOrderCount !== 1 ||
    backtestSummary.riskEventCount !== 1
) {
    throw new Error("Backtest account/risk summary is incorrect");
}

console.log("Backtest summary test passed.");
