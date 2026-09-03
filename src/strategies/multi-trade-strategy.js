export const multiTradeStrategy = {
  onCandle({ index }) {
    if (index === 0) {
      return {
        action: "ENTER",
        side: "LONG",
        stopLossPips: 5,
        takeProfitPips: 5,
      };
    }

    if (index === 2) {
      return {
        action: "ENTER",
        side: "SHORT",
        stopLossPips: 5,
        takeProfitPips: 5,
      };
    }

    return null;
  },
};