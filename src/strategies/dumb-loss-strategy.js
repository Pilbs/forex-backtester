export const dumbLossStrategy = {
  onCandle({ index }) {
    // 13:29 in our 13:00-14:00 test range.
    if (index === 29) {
      return {
        action: "ENTER",
        side: "SHORT",
        stopLossPips: 10,
        takeProfitPips: 20,
      };
    }

    return null;
  },
};