export default {
    strategy: "orb",

    market: {
        instrument: "EUR_USD",
        strategyTimeframe: "M5",
        executionTimeframe: "M5",
        from: "2026-08-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
    },

    account: {
        initialCapital: 500,
        currency: "USD",
        leverage: 30,
        positionMode: "HEDGING",

        defaultSizing: {
            type: "CASH",
            value: 300,
        },

        risk: {
            maxOpenTrades: 5,
            maxMarginUsagePercent: 80,
            maxDrawdownPercent: 25,
            breachAction: "HALT_NEW_ENTRIES",
        },
    },

    execution: {
        sameCandleConflict: "STOP_FIRST",
        slippagePips: 0,

        commission: {
            type: "NONE",
            value: 0,
        },

        closeOpenTradesAtEnd: true,
    },

    strategyConfig: {
        startHour: 8,
        startMinute: 15,
        durationMinutes: 60,
        timeZone: "America/New_York",
        stopLossPips: 10,
        takeProfitPips: 20,
        entryMode: "ATR_WEIGHTED",
        breakoutSource: "CLOSE",
        retestSource: "WICK",
        atrLength: 14,
        candidateBreakoutAtr: 0.5,
        strongBreakoutAtr: 1,
    },

    parameterGrid: {
        breakoutSource: ["CLOSE", "WICK"],
        retestSource: ["CLOSE", "WICK"],
    },

    policy: {
        warningRunCount: 100,
        maximumRunCount: 5000,
    },
};
