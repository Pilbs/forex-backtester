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
        maxOrbRangeMode: "PIPS",
        maxOrbRangeValue: 30,

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
    },

    parameterGrid: {
        breakoutCondition: ["CLOSE", "WICK"],
        requiredRetests: [0, 1],
    },

    policy: {
        warningRunCount: 100,
        maximumRunCount: 5000,
    },
};
