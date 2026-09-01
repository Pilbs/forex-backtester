export function validateCandles(candles) {
  let missingMinutes = 0;
  let largestGapMinutes = 0;

  const gaps = [];

  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1];
    const current = candles[i];

    const differenceMinutes =
      (current.time - previous.time) / 60_000;

    if (differenceMinutes > 1) {
      const missing = differenceMinutes - 1;

      missingMinutes += missing;
      largestGapMinutes = Math.max(
        largestGapMinutes,
        missing
      );

      gaps.push({
        after: previous.time,
        before: current.time,
        missingMinutes: missing,
      });
    }
  }

  return {
    candleCount: candles.length,
    missingMinutes,
    largestGapMinutes,
    gapCount: gaps.length,
    gaps,
  };
}