export function validateStrategy(strategy) {
  if (!strategy || typeof strategy !== "object") {
    throw new Error("strategy must be an object");
  }

  if (typeof strategy.onCandle !== "function") {
    throw new Error(
      "strategy must implement onCandle(context)"
    );
  }

  if (
    strategy.reset !== undefined &&
    typeof strategy.reset !== "function"
  ) {
    throw new Error(
      "strategy.reset must be a function"
    );
  }
}