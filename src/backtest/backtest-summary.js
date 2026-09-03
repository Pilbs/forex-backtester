export function summarizeTrades(trades) {
  if (!Array.isArray(trades)) {
    throw new Error("trades must be an array");
  }

  const totalTrades = trades.length;

  const wins = trades.filter(
    (trade) => trade.result === "WIN"
  ).length;

  const losses = trades.filter(
    (trade) => trade.result === "LOSS"
  ).length;

  const breakeven = trades.filter(
    (trade) => trade.result === "BREAKEVEN"
  ).length;

  const totalPnlPips = Number(
    trades
      .reduce(
        (total, trade) => total + trade.pnlPips,
        0
      )
      .toFixed(1)
  );

  const winRate =
    totalTrades === 0
      ? 0
      : Number(
          ((wins / totalTrades) * 100).toFixed(1)
        );

  return {
    totalTrades,
    wins,
    losses,
    breakeven,
    winRate,
    totalPnlPips,
  };
}