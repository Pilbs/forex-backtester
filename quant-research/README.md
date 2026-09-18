# Quant Research

This folder is for **exploratory market research in Python**.

Its job is to answer questions such as:

- Does a market behaviour actually exist?
- Under what conditions does it become stronger or weaker?
- Is the behaviour stable across different periods?
- Is an apparent edge likely to be noise?

This is deliberately separate from the existing JavaScript strategy/backtesting system.

## Mental model

```text
historical market data
        |
        v
quant-research/      discover and measure behaviour
        |
        v
src/strategies/      define precise trading rules
        |
        v
src/research/        sweep and compare strategy configurations
        |
        v
src/backtest/        simulate the defined strategy
        |
        v
paper/live trading   only after validation
```

## Structure

```text
quant-research/
├─ common/            reusable Python research helpers
├─ studies/           one folder per research question
│  └─ orb/            opening-range-breakout research
├─ outputs/           generated CSVs/charts; not committed
├─ requirements.txt
└─ README.md
```

## Rule

A study should begin with a **market hypothesis**, not a profitable-strategy target.

For example:

> After a New York opening range is broken, does EUR/USD show measurable directional continuation?

Only after the behaviour survives analysis should it be turned into strategy rules and tested in the main backtester.
