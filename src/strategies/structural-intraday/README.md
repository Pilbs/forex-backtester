# Structural Intraday Strategy

This strategy is the first StratTest implementation produced from the higher-frequency EUR/USD research branch.

## Hypothesis

Use completed H1 structure to decide when one trade direction is allowed, then require an M1 trigger before entering.

Current research seeds:

- LONG regime: London/New York overlap, completed H1 close near the lower part of the previous 12 completed H1 bars.
- SHORT regime: London/New York overlap, completed-H1 6-bar return is near neutral / slightly positive relative to H1 ATR.
- Default M1 trigger on both sides: 5-minute momentum burst.
- Default time exit: 60 minutes.

These are starting values for controlled StratTest sweeps, not fixed conclusions.

## Files

- `structural-intraday-definition.js` — public strategy metadata and sweepable parameters.
- `structural-intraday-strategy.js` — strategy orchestration, session gating, entries and exits.
- `h1-structure.js` — completed-H1 aggregation and structural measurements.
- `m1-triggers.js` — M1 trigger implementations aligned with the Python discovery definitions.

## Research / StratTest boundary

Python was used to identify the strategy family and seed values. Parameter optimisation belongs in StratTest.

The initial sweep should focus on:

1. H1 regime width / lookback.
2. M1 trigger choice.
3. Momentum threshold parameters.
4. Maximum hold time.
5. Only then, optional stop-loss / take-profit settings.

## Timeframe

The strategy requires **M1 strategy candles**. H1 state is built internally from completed M1 candles so the strategy never reads an unfinished H1 candle.
