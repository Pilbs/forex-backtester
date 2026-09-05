function round(value, decimals = 2) {
    if (!Number.isFinite(value)) {
        return value;
    }

    return Number(value.toFixed(decimals));
}

function getTradeResult(trade) {
    if (trade.result === "WIN" || trade.result === "LOSS" || trade.result === "BREAKEVEN") {
        return trade.result;
    }

    if (Number.isFinite(trade.pnlAccount)) {
        return trade.pnlAccount > 0
            ? "WIN"
            : trade.pnlAccount < 0
                ? "LOSS"
                : "BREAKEVEN";
    }

    return trade.pnlPips > 0
        ? "WIN"
        : trade.pnlPips < 0
            ? "LOSS"
            : "BREAKEVEN";
}

function calculateMaxDrawdown(values, decimals = 2) {
    let cumulative = 0;
    let peak = 0;
    let maximumDrawdown = 0;

    for (const value of values) {
        cumulative += value;
        peak = Math.max(peak, cumulative);
        maximumDrawdown = Math.max(maximumDrawdown, peak - cumulative);
    }

    return round(maximumDrawdown, decimals);
}

function calculateProfitFactor(grossProfit, grossLoss) {
    return grossLoss === 0 ? null : round(grossProfit / grossLoss);
}

function averageFinite(values, decimals = 2) {
    const finiteValues = values.filter(Number.isFinite);

    if (finiteValues.length === 0) {
        return null;
    }

    return round(
        finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length,
        decimals
    );
}

export function summarizeTrades(trades) {
    if (!Array.isArray(trades)) {
        throw new Error("trades must be an array");
    }

    const winningTrades = trades.filter((trade) => getTradeResult(trade) === "WIN");
    const losingTrades = trades.filter((trade) => getTradeResult(trade) === "LOSS");
    const breakevenTrades = trades.filter((trade) => getTradeResult(trade) === "BREAKEVEN");

    const pipsWins = trades.filter((trade) => Number.isFinite(trade.pnlPips) && trade.pnlPips > 0);
    const pipsLosses = trades.filter((trade) => Number.isFinite(trade.pnlPips) && trade.pnlPips < 0);
    const grossProfitPips = pipsWins.reduce((total, trade) => total + trade.pnlPips, 0);
    const grossLossPips = Math.abs(
        pipsLosses.reduce((total, trade) => total + trade.pnlPips, 0)
    );
    const totalPnlPips = grossProfitPips - grossLossPips;

    const accountTrades = trades.filter((trade) => Number.isFinite(trade.pnlAccount));
    const accountWins = accountTrades.filter((trade) => trade.pnlAccount > 0);
    const accountLosses = accountTrades.filter((trade) => trade.pnlAccount < 0);
    const grossProfitAccount = accountWins.reduce(
        (total, trade) => total + trade.pnlAccount,
        0
    );
    const grossLossAccount = Math.abs(
        accountLosses.reduce((total, trade) => total + trade.pnlAccount, 0)
    );
    const totalPnlAccount = accountTrades.length === 0
        ? null
        : grossProfitAccount - grossLossAccount;

    const totalTrades = trades.length;
    const pipsValues = trades
        .map((trade) => trade.pnlPips)
        .filter(Number.isFinite);
    const accountPnlValues = accountTrades.map((trade) => trade.pnlAccount);

    const losingTradesWithPositiveExcursion = losingTrades.filter(
        (trade) => Number.isFinite(trade.mfePips) && trade.mfePips > 0
    );

    return {
        totalTrades,
        wins: winningTrades.length,
        losses: losingTrades.length,
        breakeven: breakevenTrades.length,
        longTrades: trades.filter((trade) => trade.side === "LONG").length,
        shortTrades: trades.filter((trade) => trade.side === "SHORT").length,

        winRate: totalTrades === 0
            ? 0
            : round(winningTrades.length / totalTrades * 100, 1),

        totalPnlPips: round(totalPnlPips, 1),
        grossProfitPips: round(grossProfitPips, 1),
        grossLossPips: round(grossLossPips, 1),
        profitFactor: calculateProfitFactor(grossProfitPips, grossLossPips),
        averageWinPips: pipsWins.length === 0
            ? 0
            : round(grossProfitPips / pipsWins.length, 1),
        averageLossPips: pipsLosses.length === 0
            ? 0
            : round(-grossLossPips / pipsLosses.length, 1),
        expectancyPips: totalTrades === 0
            ? 0
            : round(totalPnlPips / totalTrades, 2),
        maxDrawdownPips: calculateMaxDrawdown(pipsValues, 1),
        largestWinPips: pipsValues.length === 0
            ? 0
            : round(Math.max(0, ...pipsValues), 1),
        largestLossPips: pipsValues.length === 0
            ? 0
            : round(Math.min(0, ...pipsValues), 1),

        totalPnlAccount: totalPnlAccount === null ? null : round(totalPnlAccount),
        grossProfitAccount: accountTrades.length === 0 ? null : round(grossProfitAccount),
        grossLossAccount: accountTrades.length === 0 ? null : round(grossLossAccount),
        profitFactorAccount: accountTrades.length === 0
            ? null
            : calculateProfitFactor(grossProfitAccount, grossLossAccount),
        averageWinAccount: accountTrades.length === 0
            ? null
            : accountWins.length === 0
                ? 0
                : round(grossProfitAccount / accountWins.length),
        averageLossAccount: accountTrades.length === 0
            ? null
            : accountLosses.length === 0
                ? 0
                : round(-grossLossAccount / accountLosses.length),
        expectancyAccount: accountTrades.length === 0
            ? null
            : totalTrades === 0
                ? 0
                : round(totalPnlAccount / totalTrades),
        closedTradeMaxDrawdownAccount: accountTrades.length === 0
            ? null
            : calculateMaxDrawdown(accountPnlValues),
        largestWinAccount: accountTrades.length === 0
            ? null
            : round(Math.max(0, ...accountPnlValues)),
        largestLossAccount: accountTrades.length === 0
            ? null
            : round(Math.min(0, ...accountPnlValues)),

        averageHoldingMinutes: averageFinite(
            trades.map((trade) => trade.holdingMinutes)
        ),
        averageMfePips: averageFinite(
            trades.map((trade) => trade.mfePips)
        ),
        averageMaePips: averageFinite(
            trades.map((trade) => trade.maePips)
        ),
        averageLosingTradeMfePips: averageFinite(
            losingTrades.map((trade) => trade.mfePips)
        ),
        losingTradesWithPositiveExcursion:
            losingTradesWithPositiveExcursion.length,
        losingTradesWithPositiveExcursionPercent: losingTrades.length === 0
            ? 0
            : round(
                losingTradesWithPositiveExcursion.length /
                losingTrades.length *
                100,
                1
            ),
    };
}

function groupTrades(trades, keySelector) {
    const groups = new Map();

    for (const trade of trades) {
        const time = trade.entryTime ?? trade.exitTime;
        const date = new Date(time);

        if (!Number.isFinite(date.getTime())) {
            throw new Error("Trade has invalid entryTime/exitTime");
        }

        const key = keySelector(date);
        const group = groups.get(key) ?? [];
        group.push(trade);
        groups.set(key, group);
    }

    return groups;
}

export function summarizeTradesByYear(trades) {
    if (!Array.isArray(trades)) {
        throw new Error("trades must be an array");
    }

    return [...groupTrades(
        trades,
        (date) => date.getUTCFullYear()
    ).entries()]
        .sort(([yearA], [yearB]) => yearA - yearB)
        .map(([year, yearTrades]) => ({
            year,
            ...summarizeTrades(yearTrades),
        }));
}

export function summarizeTradesByMonth(trades) {
    if (!Array.isArray(trades)) {
        throw new Error("trades must be an array");
    }

    return [...groupTrades(
        trades,
        (date) => date.toISOString().slice(0, 7)
    ).entries()]
        .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
        .map(([month, monthTrades]) => ({
            month,
            ...summarizeTrades(monthTrades),
        }));
}

export function summarizeBacktestResult(result) {
    if (!result || typeof result !== "object") {
        throw new Error("result must be an object");
    }

    const tradeSummary = summarizeTrades(result.trades ?? []);
    const account = result.account ?? null;

    const initialCapital = Number.isFinite(account?.initialCapital)
        ? account.initialCapital
        : null;
    const finalBalance = Number.isFinite(account?.balance)
        ? account.balance
        : null;
    const finalEquity = Number.isFinite(account?.equity)
        ? account.equity
        : finalBalance;

    const netPnlAccount = initialCapital !== null && finalEquity !== null
        ? finalEquity - initialCapital
        : tradeSummary.totalPnlAccount;

    const returnPercent = initialCapital && netPnlAccount !== null
        ? netPnlAccount / initialCapital * 100
        : null;

    const realizedReturnPercent = initialCapital && finalBalance !== null
        ? (finalBalance - initialCapital) / initialCapital * 100
        : null;

    return {
        ...tradeSummary,

        accountCurrency: account?.currency ?? null,
        initialCapital,
        finalBalance: finalBalance === null ? null : round(finalBalance),
        finalEquity: finalEquity === null ? null : round(finalEquity),
        netPnlAccount: netPnlAccount === null ? null : round(netPnlAccount),
        returnPercent: returnPercent === null ? null : round(returnPercent),
        realizedReturnPercent: realizedReturnPercent === null
            ? null
            : round(realizedReturnPercent),

        realizedPnlAccount: Number.isFinite(account?.realizedPnl)
            ? round(account.realizedPnl)
            : null,
        unrealizedPnlAccount: Number.isFinite(account?.unrealizedPnl)
            ? round(account.unrealizedPnl)
            : null,
        totalCommissionAccount: Number.isFinite(account?.totalCommission)
            ? round(account.totalCommission)
            : null,

        maxDrawdownAccount: Number.isFinite(account?.maxDrawdownAccount)
            ? round(account.maxDrawdownAccount)
            : null,
        maxDrawdownPercent: Number.isFinite(account?.maxDrawdownPercent)
            ? round(account.maxDrawdownPercent)
            : null,

        openTradeCount: result.openTrades?.length
            ?? account?.position?.openTradeCount
            ?? 0,
        pendingOrderCount: result.pendingOrders?.length ?? 0,
        rejectedOrderCount: result.rejectedOrders?.length ?? 0,
        riskEventCount: result.riskEvents?.length ?? 0,

        halted: account?.halted ?? false,
        haltReason: account?.haltReason ?? null,
    };
}
