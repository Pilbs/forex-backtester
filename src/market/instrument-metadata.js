const INSTRUMENTS = {
    EUR_USD: {
        baseCurrency: "EUR",
        quoteCurrency: "USD",
        pipSize: 0.0001,
        pricePrecision: 5,
        minimumUnits: 1,
        unitStep: 1,
    },

    GBP_USD: {
        baseCurrency: "GBP",
        quoteCurrency: "USD",
        pipSize: 0.0001,
        pricePrecision: 5,
        minimumUnits: 1,
        unitStep: 1,
    },

    AUD_USD: {
        baseCurrency: "AUD",
        quoteCurrency: "USD",
        pipSize: 0.0001,
        pricePrecision: 5,
        minimumUnits: 1,
        unitStep: 1,
    },

    NZD_USD: {
        baseCurrency: "NZD",
        quoteCurrency: "USD",
        pipSize: 0.0001,
        pricePrecision: 5,
        minimumUnits: 1,
        unitStep: 1,
    },

    USD_CAD: {
        baseCurrency: "USD",
        quoteCurrency: "CAD",
        pipSize: 0.0001,
        pricePrecision: 5,
        minimumUnits: 1,
        unitStep: 1,
    },

    USD_CHF: {
        baseCurrency: "USD",
        quoteCurrency: "CHF",
        pipSize: 0.0001,
        pricePrecision: 5,
        minimumUnits: 1,
        unitStep: 1,
    },

    USD_JPY: {
        baseCurrency: "USD",
        quoteCurrency: "JPY",
        pipSize: 0.01,
        pricePrecision: 3,
        minimumUnits: 1,
        unitStep: 1,
    },

    GBP_JPY: {
        baseCurrency: "GBP",
        quoteCurrency: "JPY",
        pipSize: 0.01,
        pricePrecision: 3,
        minimumUnits: 1,
        unitStep: 1,
    },
};

export function getInstrumentMetadata(instrument) {
    if (!instrument) {
        throw new Error("instrument is required");
    }

    const metadata = INSTRUMENTS[instrument];

    if (!metadata) {
        throw new Error(`Unsupported instrument: ${instrument}`);
    }

    return {
        instrument,
        ...metadata,
    };
}