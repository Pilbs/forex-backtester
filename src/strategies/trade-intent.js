function validateLevel(
  level,
  name
) {
  if (
    !level ||
    typeof level !== "object"
  ) {
    throw new Error(
      `${name} is required`
    );
  }

  if (
    level.type !== "PIPS" &&
    level.type !== "PRICE"
  ) {
    throw new Error(
      `${name}.type must be PIPS or PRICE`
    );
  }

  if (
    !Number.isFinite(level.value) ||
    level.value <= 0
  ) {
    throw new Error(
      `${name}.value must be a positive number`
    );
  }
}

export function validateTradeIntent(
  intent
) {
  if (
    !intent ||
    typeof intent !== "object"
  ) {
    throw new Error(
      "Trade intent must be an object"
    );
  }

  /*
    ENTER is the only action our
    execution engine supports today.

    We can add EXIT, MODIFY, etc later
    when the engine actually supports them.
  */
  if (intent.action !== "ENTER") {
    throw new Error(
      `Unsupported trade action: ${intent.action}`
    );
  }

  if (
    intent.side !== "LONG" &&
    intent.side !== "SHORT"
  ) {
    throw new Error(
      "Trade side must be LONG or SHORT"
    );
  }

  validateLevel(
    intent.stopLoss,
    "stopLoss"
  );

  validateLevel(
    intent.takeProfit,
    "takeProfit"
  );
}