# Quant Research

This folder is the exploratory research layer for the trading system.

## Current brief

The current research target is an **intraday EUR/USD bot** that can plausibly produce **5-10 trades on an active trading day**, with relatively small gains per trade.

Frequency is a design constraint because later production rules will remove opportunities around news, abnormal market conditions and other no-trade periods.

That frequency target is **not** permission to manufacture trades. A setup still has to survive real bid/ask execution costs and show repeatable behaviour across multiple years.

## Research rules

1. Use actual bid/ask candles for execution tests.
2. Measure signal frequency before spending time optimising a setup.
3. Treat repeated adjacent candles as one event, not many independent signals.
4. Inspect years separately; do not trust a pooled backtest alone.
5. Keep 2026 untouched until a candidate is frozen for final validation.
6. News-event exclusions will be added later as a shared filter.
7. Research scripts discover behaviour. Finished strategy logic belongs in `src/strategies/`.

## Data

Candle data is exported from the existing D1 store:

```powershell
node quant-research\export-candles.js EUR_USD M1 2022-01-01 2025-12-31 quant-research\outputs\eurusd_m1_research.csv
```

The exporter includes bid, ask and mid OHLC data.

## First frequency scan

`intraday_baseline_scan.py` compares a small set of common intraday setup families:

- 15-minute micro breakout
- trend pullback/reclaim
- 5-minute momentum burst
- short-term mean-reversion reclaim

This is deliberately a baseline scan, not a strategy generator. It answers two questions first:

> Does the setup occur often enough?

> After spread, is there enough short-horizon asymmetry to investigate further?

Run:

```powershell
python quant-research\intraday_baseline_scan.py quant-research\outputs\eurusd_m1_research.csv quant-research\outputs\intraday_baseline_scan.csv --audit-output quant-research\outputs\intraday_baseline_audit.csv
```

The study uses 2022-2025 as research data. It does not evaluate 2026.


## Context scan

`intraday_context_scan.py` takes the same four raw setup families and measures three predefined context factors independently:

- market session / time-of-day
- current volatility relative to the recent 4-hour baseline
- whether the previous 15-minute move is aligned with, neutral to, or opposed to the proposed trade direction

This is still discovery, not strategy optimisation. Context combinations are deliberately **not** brute-forced yet.

Research split:

- 2022-2024: development
- 2025: validation check
- 2026: untouched holdout

Run:

```powershell
python quant-research\intraday_context_scan.py quant-research\outputs\eurusd_m1_research.csv quant-research\outputs\intraday_context_scan.csv --audit-output quant-research\outputs\intraday_context_audit.csv
```

The console prints a compact shortlist discovered from 2022-2024 and shows the matching 2025 result beside it. The full independent context results are written to CSV.
