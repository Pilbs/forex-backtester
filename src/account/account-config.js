import { validateEntrySize } from "./position-sizing.js";

const POSITION_MODES = new Set(["NETTING", "HEDGING"]);
const BREACH_ACTIONS = new Set(["HALT_NEW_ENTRIES", "CLOSE_ALL_AND_HALT"]);

function validateOptionalPositive(value, name, { allowZero = false } = {}) {
    if (value === null || value === undefined) {
        return;
    }

    const valid = Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);

    if (!valid) {
        const description = allowZero ? "a non-negative" : "a positive";
        throw new Error(`${name} must be ${description} number or null`);
    }
}

export function resolveAccountConfig(input = {}, { defaultCurrency = "USD" } = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("accountConfig must be an object");
    }

    const config = {
        initialCapital: 10000,
        currency: defaultCurrency,
        quoteToAccountRate: null,
        leverage: 30,
        positionMode: "HEDGING",

        defaultSizing: {
            type: "PERCENT_EQUITY",
            value: 1,
        },

        riskTimeZone: "UTC",
        marginCallLevelPercent: null,

        risk: {
            maxOpenTrades: null,
            maxTradesPerSide: null,
            maxPositionUnits: null,
            maxGrossExposure: null,
            maxMarginUsagePercent: 100,
            maxDrawdownPercent: null,
            maxDailyLossPercent: null,
            breachAction: "HALT_NEW_ENTRIES",
        },

        ...input,

        risk: {
            maxOpenTrades: null,
            maxTradesPerSide: null,
            maxPositionUnits: null,
            maxGrossExposure: null,
            maxMarginUsagePercent: 100,
            maxDrawdownPercent: null,
            maxDailyLossPercent: null,
            breachAction: "HALT_NEW_ENTRIES",
            ...(input.risk ?? {}),
        },
    };

    if (!Number.isFinite(config.initialCapital) || config.initialCapital <= 0) {
        throw new Error("initialCapital must be a positive number");
    }

    if (typeof config.currency !== "string" || !/^[A-Z]{3}$/.test(config.currency)) {
        throw new Error("currency must be a three-letter uppercase currency code");
    }

    validateOptionalPositive(config.quoteToAccountRate, "quoteToAccountRate");

    if (!Number.isFinite(config.leverage) || config.leverage <= 0) {
        throw new Error("leverage must be a positive number");
    }

    if (!POSITION_MODES.has(config.positionMode)) {
        throw new Error("positionMode must be NETTING or HEDGING");
    }

    if (typeof config.riskTimeZone !== "string" || !config.riskTimeZone) {
        throw new Error("riskTimeZone must be a non-empty IANA timezone string");
    }

    validateEntrySize(config.defaultSizing, "defaultSizing");
    validateOptionalPositive(config.marginCallLevelPercent, "marginCallLevelPercent");
    validateOptionalPositive(config.risk.maxOpenTrades, "risk.maxOpenTrades");
    validateOptionalPositive(config.risk.maxTradesPerSide, "risk.maxTradesPerSide");
    validateOptionalPositive(config.risk.maxPositionUnits, "risk.maxPositionUnits");
    validateOptionalPositive(config.risk.maxGrossExposure, "risk.maxGrossExposure");
    validateOptionalPositive(
        config.risk.maxMarginUsagePercent,
        "risk.maxMarginUsagePercent",
        { allowZero: true }
    );
    validateOptionalPositive(config.risk.maxDrawdownPercent, "risk.maxDrawdownPercent");
    validateOptionalPositive(config.risk.maxDailyLossPercent, "risk.maxDailyLossPercent");

    if (!BREACH_ACTIONS.has(config.risk.breachAction)) {
        throw new Error(
            "risk.breachAction must be HALT_NEW_ENTRIES or CLOSE_ALL_AND_HALT"
        );
    }

    return config;
}

export function resolveQuoteToAccountRate({
    accountConfig,
    instrumentMetadata,
}) {
    if (accountConfig.currency === instrumentMetadata.quoteCurrency) {
        return 1;
    }

    if (Number.isFinite(accountConfig.quoteToAccountRate) && accountConfig.quoteToAccountRate > 0) {
        return accountConfig.quoteToAccountRate;
    }

    throw new Error(
        `quoteToAccountRate is required when account currency ${accountConfig.currency} ` +
        `differs from instrument quote currency ${instrumentMetadata.quoteCurrency}`
    );
}
