export default {
    strategy: "structural-intraday",

    market: {
        instrument: "EUR_USD",
        strategyTimeframe: "M1",
        executionTimeframe: "M1",

        // Exact cloud validation window used for parity checking.
        from: "2025-07-31T23:00:00.000Z",
        to: "2025-11-01T00:00:00.000Z",
    },

    account: {
        initialCapital: 1000,
        currency: "USD",
        leverage: 30,
        positionMode: "HEDGING",
        defaultSizing: {
            type: "UNITS",
            value: 10000,
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
        // Frontend: Enable long side
        longEnabled: true,

        // Frontend: Enable short side
        shortEnabled: false,

        // Frontend: H1 ATR length
        h1AtrLength: 14,

        // Frontend: Long regime: H1 range lookback
        longH1RangeLookbackHours: 12,

        // Frontend: Long regime: minimum range position
        longRangePositionMin: 0.080119,

        // Frontend: Long regime: maximum range position
        longRangePositionMax: 0.16144,

        // Frontend: Long M1 trigger
        longTriggerType: "MICRO_BREAKOUT_15M",

        // Short-side values remain present but disabled.
        shortH1ReturnLookbackHours: 6,
        shortReturnAtrMin: -0.083102,
        shortReturnAtrMax: 0.484133,
        shortTriggerType: "MOMENTUM_BURST_5M",

        // Momentum settings are unused by the current long trigger but match
        // the cloud run so the full strategy config stays comparable.
        momentumReturnLookback: 5,
        momentumAtrLength: 14,
        momentumAtrMultiple: 1.25,
        momentumFastEma: 30,
        momentumSlowEma: 60,

        // Frontend: Entry cooldown minutes
        cooldownMinutes: 15,

        // Frontend: Maximum hold minutes
        maxHoldMinutes: 60,

        // Frontend: Enable stop loss
        stopLossEnabled: false,
        stopLossPips: 10,

        // Frontend: Enable take profit
        takeProfitEnabled: false,
        takeProfitPips: 15,
    },

    // Start with one frozen parity run. Add sweep values only after the local
    // result matches the known cloud result.
    parameterGrid: {},

    policy: {
        warningRunCount: 100,
        maximumRunCount: 5000,
    },
};
