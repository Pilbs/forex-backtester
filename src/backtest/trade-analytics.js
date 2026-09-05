function round(value, decimals = 2) {
    return Number(value.toFixed(decimals));
}

function getKnownExitPnlValues(trade) {
    const values = [];

    for (const fill of trade.exitFills ?? []) {
        if (Number.isFinite(fill.pnlPips)) {
            values.push(fill.pnlPips);
        }
    }

    if (Number.isFinite(trade.pnlPips)) {
        values.push(trade.pnlPips);
    }

    return values;
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

    let pathMfePips;
    let pathMaePips;

    if (trade.side === "LONG") {
        pathMfePips = Math.max(
            0,
            (trade.highestPrice - trade.entryPrice) / pipSize
        );
        pathMaePips = Math.max(
            0,
            (trade.entryPrice - trade.lowestPrice) / pipSize
        );
    } else if (trade.side === "SHORT") {
        pathMfePips = Math.max(
            0,
            (trade.entryPrice - trade.lowestPrice) / pipSize
        );
        pathMaePips = Math.max(
            0,
            (trade.highestPrice - trade.entryPrice) / pipSize
        );
    } else {
        return {
            mfePips: null,
            maePips: null,
        };
    }

    const knownExitPnlValues = getKnownExitPnlValues(trade);
    const exitMfePips = knownExitPnlValues.length === 0
        ? 0
        : Math.max(0, ...knownExitPnlValues);
    const exitMaePips = knownExitPnlValues.length === 0
        ? 0
        : Math.max(0, ...knownExitPnlValues.map((value) => -value));

    return {
        mfePips: round(Math.max(pathMfePips, exitMfePips), 2),
        maePips: round(Math.max(pathMaePips, exitMaePips), 2),
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
            : "MID_OHLC_PLUS_EXECUTION_EXITS",

        excursionMethod: mfePips === null
            ? null
            : "CAUSAL_CONSERVATIVE",
    };
}

export function enrichTradesAnalytics(trades, pipSize) {
    if (!Array.isArray(trades)) {
        throw new Error("trades must be an array");
    }

    return trades.map((trade) => enrichTradeAnalytics(trade, pipSize));
}
