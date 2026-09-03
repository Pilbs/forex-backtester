export const dumbTestStrategy = {
  onCandle({ index }) {
    if (index === 9) {
      return {
        action: "ENTER",
        side: "LONG",

        stopLossPips: 10,
        takeProfitPips: 20,
      };
    }

    return null;
  },
};