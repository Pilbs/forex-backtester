function round(value, decimals = 2) {
    return Number(value.toFixed(decimals));
}

function calculateMaxDrawdownPips(trades) {
    let cumulativePnl = 0;
    let peakPnl = 0;
    let maximumDrawdown = 0;

    for (const trade of trades) {
        cumulativePnl += trade.pnlPips;
        peakPnl = Math.max(peakPnl, cumulativePnl);
        maximumDrawdown = Math.max(maximumDrawdown, peakPnl - cumulativePnl);
    }

    return round(maximumDrawdown, 1);
}

export function summarizeTrades(trades) {
    if (!Array.isArray(trades)) {
        throw new Error("trades must be an array");
    }

    const winningTrades = trades.filter((trade) => trade.pnlPips > 0);
    const losingTrades = trades.filter((trade) => trade.pnlPips < 0);
    const breakevenTrades = trades.filter((trade) => trade.pnlPips === 0);
    const totalTrades = trades.length;
    const grossProfitPips = winningTrades.reduce(
        (total, trade) => total + trade.pnlPips,
        0
    );
    const grossLossPips = Math.abs(losingTrades.reduce(
        (total, trade) => total + trade.pnlPips,
        0
    ));
    const totalPnlPips = grossProfitPips - grossLossPips;
    const winRate = totalTrades === 0 ? 0 : winningTrades.length / totalTrades * 100;
    const averageWinPips = winningTrades.length === 0
        ? 0
        : grossProfitPips / winningTrades.length;
    const averageLossPips = losingTrades.length === 0
        ? 0
        : -grossLossPips / losingTrades.length;
    const expectancyPips = totalTrades === 0 ? 0 : totalPnlPips / totalTrades;
    const profitFactor = grossLossPips === 0
        ? null
        : grossProfitPips / grossLossPips;
    const pnlValues = trades.map((trade) => trade.pnlPips);

    return {
        totalTrades,
        wins: winningTrades.length,
        losses: losingTrades.length,
        breakeven: breakevenTrades.length,
        longTrades: trades.filter((trade) => trade.side === "LONG").length,
        shortTrades: trades.filter((trade) => trade.side === "SHORT").length,
        winRate: round(winRate, 1),
        totalPnlPips: round(totalPnlPips, 1),
        grossProfitPips: round(grossProfitPips, 1),
        grossLossPips: round(grossLossPips, 1),
        profitFactor: profitFactor === null ? null : round(profitFactor),
        averageWinPips: round(averageWinPips, 1),
        averageLossPips: round(averageLossPips, 1),
        expectancyPips: round(expectancyPips, 2),
        maxDrawdownPips: calculateMaxDrawdownPips(trades),
        largestWinPips: pnlValues.length === 0 ? 0 : round(Math.max(0, ...pnlValues), 1),
        largestLossPips: pnlValues.length === 0 ? 0 : round(Math.min(0, ...pnlValues), 1),
    };
}

export function summarizeTradesByYear(trades, timeField = "entryTime") {
    if (!Array.isArray(trades)) {
        throw new Error("trades must be an array");
    }

    const tradesByYear = new Map();

    for (const trade of trades) {
        const time = trade[timeField] ?? trade.exitTime;
        const date = new Date(time);

        if (!Number.isFinite(date.getTime())) {
            throw new Error(`Trade has invalid ${timeField}`);
        }

        const year = date.getUTCFullYear();
        const yearTrades = tradesByYear.get(year) ?? [];
        yearTrades.push(trade);
        tradesByYear.set(year, yearTrades);
    }

    return [...tradesByYear.entries()]
        .sort(([yearA], [yearB]) => yearA - yearB)
        .map(([year, yearTrades]) => ({
            year,
            ...summarizeTrades(yearTrades),
        }));
}
