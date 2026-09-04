const INSTRUMENTS = {
  EUR_USD: {
    pipSize: 0.0001,
  },

  GBP_USD: {
    pipSize: 0.0001,
  },

  AUD_USD: {
    pipSize: 0.0001,
  },

  NZD_USD: {
    pipSize: 0.0001,
  },

  USD_CAD: {
    pipSize: 0.0001,
  },

  USD_CHF: {
    pipSize: 0.0001,
  },

  USD_JPY: {
    pipSize: 0.01,
  },

  GBP_JPY: {
    pipSize: 0.01,
  },
};

export function getInstrumentMetadata(
  instrument
) {
  if (!instrument) {
    throw new Error(
      "instrument is required"
    );
  }

  const metadata =
    INSTRUMENTS[instrument];

  if (!metadata) {
    throw new Error(
      `Unsupported instrument: ${instrument}`
    );
  }

  return {
    instrument,
    ...metadata,
  };
}