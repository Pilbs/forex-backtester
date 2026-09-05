# Human Backtesting V1

# Purpose

Human Backtesting V1 is the deterministic strategy-execution and research foundation for the larger strategy research platform.

The product direction is:

```text
strategy source
    ↓
internal strategy contract
    ↓
realistic backtest engine
    ↓
multi-parameter research
    ↓
structured experiment results
    ↓
human web UI
    ↓
future AI research agent
```

This milestone deliberately stops before the frontend, AI agent and Pine parser.

# Human Workflow

A human can now:

1. Port a strategy into JavaScript.
2. Declare its configurable parameters in a strategy definition.
3. Choose instrument, date range, strategy timeframe and execution timeframe.
4. Configure capital, account currency, leverage, sizing and risk constraints.
5. Configure spread-aware execution assumptions, slippage and commission.
6. Preview the number of requested parameter combinations.
7. Apply warning and hard run-count limits.
8. Load the historical dataset once.
9. Run all valid configurations against the same in-memory dataset.
10. Rank runs using both pip and account-based metrics.
11. Save the complete experiment as JSON.
12. Reproduce a named experiment with an explicit experiment ID.

# Execution Model

The engine currently supports:

```text
multiple simultaneous open trades
HEDGING and NETTING position modes
market orders
limit orders
stop orders
stop-limit orders
pending order cancellation
GTC, DAY, IOC and FOK lifecycle rules
partial exits
multiple exit instructions
dynamic stop updates
dynamic target updates
stop/target removal
strategy-driven exits
fixed unit sizing
cash sizing
percent-equity sizing
risk-percent sizing
bid/ask-aware execution
slippage
commission
leverage
margin
account balance and equity
realised and unrealised P&L
drawdown
daily loss controls
margin controls
maximum open-trade controls
maximum exposure controls
```

# Deterministic OHLC Rules

The backtester uses OHLC candles rather than tick or order-book data.

That requires explicit deterministic rules where the candle does not reveal event order.

Current rules:

- A completed strategy candle becomes visible only at its close time.
- A market order emitted at an execution-candle boundary fills at that execution candle's open.
- LONG entries use ASK and LONG exits use BID.
- SHORT entries use BID and SHORT exits use ASK.
- If stop and target are both touched in the same execution candle, `sameCandleConflict` decides which is assumed first.
- The default is `STOP_FIRST`.
- An entry filled intrabar does not allow its protective stop/target to use that same candle's entire OHLC range. Protection becomes eligible on the next execution candle.
- A stop-limit order activated intrabar is not also filled from the unknowable earlier/later movement of that same candle. Its limit becomes fill-eligible on a later execution candle.
- Pending orders still open at the end of the test are cancelled.
- Open trades can optionally be closed at the final execution candle.

These rules intentionally prefer reproducibility and conservative handling over pretending OHLC data contains tick-level ordering.

# Trade Diagnostics

Completed trades are enriched with:

```text
holdingMs
holdingMinutes
mfePips
maePips
wasEverProfitable
excursionPriceBasis
```

MFE is maximum favourable excursion.

MAE is maximum adverse excursion.

The current excursion calculation uses the recorded MID OHLC extrema against the actual execution entry price. It is therefore a bar-data research approximation, not tick-perfect excursion measurement.

This is still useful for generic research questions such as:

```text
How many losing trades were profitable at some point?
How long do trades normally remain open?
Do losers commonly reach +5 pips before reversing?
Would earlier exit logic be worth testing?
```

Summary output also includes:

```text
averageHoldingMinutes
averageMfePips
averageMaePips
averageLosingTradeMfePips
losingTradesWithPositiveExcursion
losingTradesWithPositiveExcursionPercent
```

# Research Model

The parameter grid is a Cartesian product.

Example:

```js
parameterGrid: {
    stopLossPips: [8, 10, 12],
    takeProfitPips: [15, 20],
    durationMinutes: [30, 60, 90],
}
```

This requests:

```text
3 × 2 × 3 = 18 runs
```

Duplicate values in a sweep dimension are rejected to prevent accidentally running the same configuration more than once.

The research layer supports:

```text
warningRunCount
maximumRunCount
overrideLimits
invalid strategy combinations
progress callbacks
abort signals
fresh strategy instance per run
optional trade detail
optional full run detail
```

The research engine knows only technical limits. It contains no customer-plan, billing or pricing logic.

# Account Currency

If account currency equals the instrument quote currency, conversion is direct.

Example:

```text
EUR_USD instrument
USD account
```

If they differ, Human Backtesting V1 requires an explicit fixed `quoteToAccountRate`.

Example:

```text
EUR_USD instrument
GBP account
quoteToAccountRate: 0.75
```

Dynamic historical FX conversion is deferred.

The engine must not invent a historical conversion rate.

# Data Model

Cloudflare D1 remains the canonical historical candle store.

The high-level experiment workflow loads the requested dataset once:

```text
D1 load
    ↓
in-memory dataset
    ↓
run 1
run 2
run 3
...
run N
```

It does not query D1 once per parameter combination.

# Structured Experiment Result

Experiment JSON includes:

```text
schema version
experiment ID
strategy ID/name/version
base strategy config
parameter grid
requested/valid/invalid combination counts
policy and override state
instrument
date range
strategy timeframe
execution timeframe
account assumptions
execution assumptions
dataset metadata
dataset load timing
every run's exact strategy config
run status/errors
summary metrics
yearly summaries
monthly summaries
trade diagnostics when requested
run timing
```

This JSON boundary is intended to be consumed later by:

```text
web/API layer
saved-experiment service
comparison UI
AI research tools
```

# Common Indicator Layer

The strategy toolkit currently includes:

```text
SMA
EMA
RMA / Wilder smoothing
ATR
RSI
rolling highest
rolling lowest
rolling standard deviation
true range
crossover
crossunder
confirmed pivot high
confirmed pivot low
```

The toolkit should expand when real strategies require additional generic primitives.

It should not become strategy-specific.

# Current Scope Boundaries

Human Backtesting V1 does not currently provide:

```text
frontend/web application
accounts/auth/billing
AI research agent
Pine parser
full Pine runtime
true multi-instrument synchronized execution
tick simulation
order-book simulation
dynamic historical account-currency conversion
broker-specific margin models
```

Multiple trades can be open simultaneously, but one backtest dataset currently represents one instrument.

Future multi-instrument execution should add a synchronized market clock/data layer rather than embedding special cases in individual strategies.

# Clean Architecture

Current responsibilities are:

```text
src/data/
    historical data access/import

src/market/
    instrument/timeframe metadata

src/time/
    generic timezone/session helpers

src/indicators/
    generic strategy calculations

src/strategies/
    strategy definitions and strategy-specific logic

src/account/
    account config, sizing and account state

src/backtest/
    deterministic execution and result construction

src/research/
    experiment planning and execution

src/reporting/
    console and JSON presentation/persistence

src/experiments/
    human/reference experiment configurations
```

The ORB strategy is a reference strategy only.

Generic execution/research behaviour must not migrate into the ORB folder.

# Acceptance Test

Run the deterministic suite:

```powershell
npm test
```

Run the real D1 ORB integration:

```powershell
npm run test:orb
```

Run the controlled six-run Human V1 acceptance experiment:

```powershell
npm run research:orb:smoke
```

The acceptance experiment uses three months of EUR/USD data and six parameter combinations.

Its output is written to:

```text
output/experiments/human-v1-orb-smoke.json
```

The `output/` directory is intentionally ignored by Git.

The experiment result should be inspected before declaring the milestone complete.

# Moonshot Boundary

Human Backtesting V1 is successful if the next major layers can be added as callers or adapters rather than requiring the backtest core to be rewritten.

The intended direction remains:

```text
Pine / strategy input
        ↓
translation into internal strategy contract
        ↓
same deterministic engine
        ↓
same research engine
        ↓
same structured result
        ↓
human UI and AI research agent
```
