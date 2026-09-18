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


## Intraday behaviour map

`intraday_behaviour_map.py` stops assuming a named strategy and instead samples the market on a fixed 5-minute grid during:

- London morning
- London / New York overlap

It measures development-only deciles for:

- 5, 15 and 30-minute movement relative to ATR
- position inside the recent 30-minute range
- short-term z-score / stretch
- EMA9 vs EMA30 separation
- current candle body size/direction
- relative volatility
- current spread

For every state it measures cost-aware LONG and SHORT outcomes over the next 5/10/15/30 minutes plus 3/3 and 5/3 target-stop behaviour.

The decile boundaries are fitted using **2022-2024 only**. The exact same boundaries are then applied to 2025. 2026 remains untouched.

Run:

```powershell
python quant-research\intraday_behaviour_map.py quant-research\outputs\eurusd_m1_research.csv quant-research\outputs\intraday_behaviour_map.csv --audit-output quant-research\outputs\intraday_behaviour_audit.csv
```

The console shortlist only includes development states occurring roughly 3-12 times per weekday, keeping the search relevant to the intended 5-10 trade/day bot.


## Interpretable rule discovery

`intraday_rule_discovery.py` uses shallow decision trees as a **rule-discovery tool**, not as a production model.

The trees are trained separately for:

- London morning LONG
- London morning SHORT
- London / New York overlap LONG
- London / New York overlap SHORT

Inputs are the behaviour-map state features. The prediction target is 15-minute net movement after bid/ask spread, clipped to +/-10 pips during training so rare extreme moves cannot dominate the splits.

Constraints are intentionally strict:

- maximum tree depth: 3
- minimum development samples per leaf: 2500
- 2022-2024 only for fitting
- 2025 only for applying the frozen rules
- 2026 untouched

The goal is to extract a small readable rule such as:

> ret_15m_atr <= X AND range_position_30 <= Y AND atr_relative > Z

Any surviving rule is then implemented as a normal configurable strategy in StratTest. The tree itself is not deployed.

Install the added dependency once:

```powershell
pip install -r quant-research\requirements.txt
```

Run using the behaviour-map audit already produced:

```powershell
python quant-research\intraday_rule_discovery.py quant-research\outputs\intraday_behaviour_audit.csv quant-research\outputs\intraday_rule_discovery.csv
```
