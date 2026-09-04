const MULTIPLIERS = {
  S: 1000,
  M: 60 * 1000,
  H: 60 * 60 * 1000,
};

export function getTimeframeDurationMs(
  timeframe
) {
  if (!timeframe) {
    throw new Error(
      "timeframe is required"
    );
  }

  const match =
    /^([SMH])(\d+)$/.exec(
      timeframe.toUpperCase()
    );

  if (!match) {
    throw new Error(
      `Unsupported fixed timeframe: ${timeframe}`
    );
  }

  const [, unit, amountText] =
    match;

  const amount =
    Number(amountText);

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      `Invalid timeframe: ${timeframe}`
    );
  }

  return (
    amount *
    MULTIPLIERS[unit]
  );
}