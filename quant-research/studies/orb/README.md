# ORB Behaviour Study

## Question

After a 60-minute New York opening range is broken, does EUR/USD show measurable directional continuation?

## First dataset

Start with approximately one year of EUR/USD M5 candles.

For each trading day, record:

- opening-range high and low
- opening-range size
- first breakout direction
- breakout timestamp
- price movement 15, 30, 60 and 120 minutes after the breakout
- maximum favourable excursion after the breakout
- maximum adverse excursion after the breakout

## Important

This study does **not** use stop-loss, take-profit, retest or optimisation rules.

Those belong later, after we know what the underlying market behaviour looks like.


## Run it

From the repository root:

### 1. Export candles from the existing D1 store

```powershell
node quant-research/export-candles.js EUR_USD M5 2025-09-18 2026-09-18 quant-research/outputs/eurusd_m5_1y.csv
```

### 2. Create a Python environment and install dependencies

```powershell
python -m venv quant-research/.venv
quant-research/.venv/Scripts/Activate.ps1
pip install -r quant-research/requirements.txt
```

### 3. Run the ORB behaviour study

```powershell
python quant-research/studies/orb/breakout_behaviour.py quant-research/outputs/eurusd_m5_1y.csv quant-research/outputs/orb_breakout_behaviour.csv
```

The study defaults to a 08:15 New York start and a 60-minute opening range.

The output is one row per session and includes the first breakout plus 15/30/60/120-minute movement and 120-minute MFE/MAE.
