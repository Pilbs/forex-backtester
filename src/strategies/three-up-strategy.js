let patternWasTrue = false;

export const threeUpStrategy = {
  reset() {
    patternWasTrue = false;
  },

  onCandle({ getRecentCandles }) {
    const recent = getRecentCandles(3);

    if (recent.length < 3) {
      patternWasTrue = false;
      return null;
    }

    const [first, second, third] = recent;

    const threeHigherCloses =
      second.mid.close > first.mid.close &&
      third.mid.close > second.mid.close;

    // If pattern is not currently true, reset the flag
    // and do nothing.
    if (!threeHigherCloses) {
      patternWasTrue = false;
      return null;
    }

    // If pattern is still true from the previous candle,
    // do not keep firing repeated signals.
    if (patternWasTrue) {
      return null;
    }

    // Pattern has just turned true now.
    patternWasTrue = true;

    return {
      action: "ENTER",
      side: "LONG",
      stopLossPips: 5,
      takeProfitPips: 5,
    };
  },
};