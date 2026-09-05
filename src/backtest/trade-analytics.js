function round(value, decimals = 2) {
    return Number(value.toFixed(decimals));
}

function calculateExcursions(trade, pipSize) {
    if (
        !Number.isFinite(trade.entryPrice) ||
        !Number.isFinite(trade.highestPrice) ||
        !Number.isFinite(trade.lowestPrice)
    ) {
        return {
            mfePips: null,
            maePips: null,
        };
    }

    if (trade.side === "LONG") {
        return {
            mfePips: round(
                Math.max(0, (trade.highestPrice - trade.entryPrice) / pipSize),
                2
            ),
            maePips: round(
                Math.max(0, (trade.entryPrice - trade.lowestPrice) / pipSize),
                2
            ),
        };
    }

    if (trade.side === "SHORT") {
        return {
            mfePips: round(
                Math.max(0, (trade.entryPrice - trade.lowestPrice) / pipSize),
                2
            ),
            maePips: round(
                Math.max(0, (trade.highestPrice - trade.entryPrice) / pipSize),
                2
            ),
        };
    }

    return {
        mfePips: null,
        maePips: null,
    };
}

export function enrichTradeAnalytics(trade, pipSize) {
    if (!trade || typeof trade !== "object") {
        throw new Error("trade must be an object");
    }

    if (!Number.isFinite(pipSize) || pipSize <= 0) {
        throw new Error("pipSize must be a positive number");
    }

    const entryTime = trade.entryTime;
    const exitTime = trade.exitTime;

    const holdingMs = Number.isFinite(entryTime) && Number.isFinite(exitTime)
        ? Math.max(0, exitTime - entryTime)
        : null;

    const {
        mfePips,
        maePips,
    } = calculateExcursions(trade, pipSize);

    return {
        ...trade,

        holdingMs,
        holdingMinutes: holdingMs === null
            ? null
            : round(holdingMs / 60000, 2),

        mfePips,
        maePips,

        wasEverProfitable: mfePips === null
            ? null
            : mfePips > 0,

        excursionPriceBasis: mfePips === null
            ? null
            : "MID_OHLC",
    };
}

export function enrichTradesAnalytics(trades, pipSize) {
    if (!Array.isArray(trades)) {
        throw new Error("trades must be an array");
    }

    return trades.map((trade) => enrichTradeAnalytics(trade, pipSize));
}
