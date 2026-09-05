import { getZonedDateKey } from "../time/zoned-time.js";

function getTradeMarkPrice(trade, candle, point) {
    return trade.side === "LONG"
        ? candle.bid[point]
        : candle.ask[point];
}

function calculateUnrealizedPnlAccount({
    trade,
    candle,
    point,
    quoteToAccountRate,
}) {
    const markPrice = getTradeMarkPrice(trade, candle, point);
    const priceDifference = trade.side === "LONG"
        ? markPrice - trade.entryPrice
        : trade.entryPrice - markPrice;

    return priceDifference * trade.remainingUnits * quoteToAccountRate;
}

export function createPositionSnapshot(openTrades) {
    const longTrades = openTrades.filter((trade) => trade.side === "LONG");
    const shortTrades = openTrades.filter((trade) => trade.side === "SHORT");
    const longUnits = longTrades.reduce((total, trade) => total + trade.remainingUnits, 0);
    const shortUnits = shortTrades.reduce((total, trade) => total + trade.remainingUnits, 0);

    let side = "FLAT";

    if (longUnits > 0 && shortUnits > 0) {
        side = "HEDGED";
    } else if (longUnits > 0) {
        side = "LONG";
    } else if (shortUnits > 0) {
        side = "SHORT";
    }

    const weightedAverage = (trades, totalUnits) => {
        if (totalUnits === 0) {
            return null;
        }

        return trades.reduce(
            (total, trade) => total + trade.entryPrice * trade.remainingUnits,
            0
        ) / totalUnits;
    };

    return {
        side,
        openTradeCount: openTrades.length,
        longTradeCount: longTrades.length,
        shortTradeCount: shortTrades.length,
        longUnits,
        shortUnits,
        netUnits: longUnits - shortUnits,
        grossUnits: longUnits + shortUnits,
        averageLongEntryPrice: weightedAverage(longTrades, longUnits),
        averageShortEntryPrice: weightedAverage(shortTrades, shortUnits),
    };
}

export function createAccountLedger({
    accountConfig,
    quoteToAccountRate,
}) {
    let balance = accountConfig.initialCapital;
    let totalCommission = 0;
    let peakEquity = accountConfig.initialCapital;
    let maxDrawdownAccount = 0;
    let maxDrawdownPercent = 0;
    let currentDayKey = null;
    let dayStartEquity = accountConfig.initialCapital;
    let halted = false;
    let haltReason = null;

    function recordCommission(amount) {
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error("Commission amount must be a non-negative number");
        }

        balance -= amount;
        totalCommission += amount;
    }

    function recordRealizedPnl(amount) {
        if (!Number.isFinite(amount)) {
            throw new Error("Realized PnL must be a finite number");
        }

        balance += amount;
    }

    function halt(reason) {
        halted = true;
        haltReason = reason;
    }

    function snapshot({
        openTrades,
        candle,
        point = "close",
        time = candle.time,
    }) {
        const unrealizedPnl = openTrades.reduce(
            (total, trade) => total + calculateUnrealizedPnlAccount({
                trade,
                candle,
                point,
                quoteToAccountRate,
            }),
            0
        );

        const equity = balance + unrealizedPnl;
        const dayKey = getZonedDateKey(time, accountConfig.riskTimeZone);

        if (currentDayKey !== dayKey) {
            currentDayKey = dayKey;
            dayStartEquity = equity;
        }

        if (equity > peakEquity) {
            peakEquity = equity;
        }

        const currentDrawdownAccount = Math.max(0, peakEquity - equity);
        const currentDrawdownPercent = peakEquity > 0
            ? currentDrawdownAccount / peakEquity * 100
            : 0;

        if (currentDrawdownAccount > maxDrawdownAccount) {
            maxDrawdownAccount = currentDrawdownAccount;
        }

        if (currentDrawdownPercent > maxDrawdownPercent) {
            maxDrawdownPercent = currentDrawdownPercent;
        }

        const midPrice = candle.mid[point];
        const grossExposure = openTrades.reduce(
            (total, trade) => total + trade.remainingUnits * midPrice * quoteToAccountRate,
            0
        );
        const marginUsed = grossExposure / accountConfig.leverage;
        const freeMargin = equity - marginUsed;
        const marginUsagePercent = equity > 0 ? marginUsed / equity * 100 : null;
        const marginLevelPercent = marginUsed > 0 ? equity / marginUsed * 100 : null;
        const dailyPnl = equity - dayStartEquity;
        const dailyLossPercent = dailyPnl < 0 && dayStartEquity > 0
            ? Math.abs(dailyPnl) / dayStartEquity * 100
            : 0;

        return {
            currency: accountConfig.currency,
            initialCapital: accountConfig.initialCapital,
            balance,
            equity,
            grossRealizedPnl: balance - accountConfig.initialCapital + totalCommission,
            realizedPnl: balance - accountConfig.initialCapital,
            unrealizedPnl,
            totalCommission,
            peakEquity,
            currentDrawdownAccount,
            currentDrawdownPercent,
            maxDrawdownAccount,
            maxDrawdownPercent,
            dayKey: currentDayKey,
            dayStartEquity,
            dailyPnl,
            dailyLossPercent,
            grossExposure,
            marginUsed,
            freeMargin,
            marginUsagePercent,
            marginLevelPercent,
            leverage: accountConfig.leverage,
            halted,
            haltReason,
            position: createPositionSnapshot(openTrades),
        };
    }

    return {
        recordCommission,
        recordRealizedPnl,
        halt,
        snapshot,
        isHalted() {
            return halted;
        },
        getHaltReason() {
            return haltReason;
        },
    };
}
