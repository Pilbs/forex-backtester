# Volume breakout research

This study is the first experiment using the shared run-folder convention.

## Why this shape

Each experiment writes to its own immutable folder so multiple agents can add or run studies without overwriting each other's result files.

Run folders use:

```
<study>__<instrument>__<data-label>__<UTC timestamp>
```

Example:

```
volume_breakout__EUR_USD__2022-2025__20260918T184500Z/
```

Each folder contains:

- `manifest.json` — exactly what was tested, dataset split, parameters and execution assumptions.
- `summary.csv` — aggregated development and validation results.
- `signals.csv` — every accepted signal and its forward cost-aware outcome.
- `overview.png` — development versus 2025 validation for the strongest development configurations.
- `frequency.png` — how signal frequency changes as volume confirmation becomes stricter.

Generated run folders remain ignored by git under `quant-research/outputs/`.

## First hypothesis

A recent-range breakout may have better short-horizon follow-through when the breakout candle has elevated tick volume relative to its own trailing baseline.

The initial scan tests M1, M5 and M15 without using 2026.

Defaults:

- breakout lookback: 5, 10 and 20 bars
- volume baseline: previous 20 completed bars
- minimum relative volume: 1.0x, 1.25x, 1.5x and 2.0x
- maximum spread: 1.5 pips
- sessions: London morning, London/New York overlap and New York morning
- forward outcomes: 15, 30 and 60 minutes

Bid/ask execution is used: a LONG enters next-bar ask and exits bid; a SHORT enters next-bar bid and exits ask.

## Run

From the repository root:

```powershell
python quant-research\volume_breakout_scan.py quant-research\outputs\eurusd_m1_research.csv
```

To narrow the first pass:

```powershell
python quant-research\volume_breakout_scan.py quant-research\outputs\eurusd_m1_research.csv --timeframes M5 --lookbacks 5 10 20 --volume-ratios 1 1.25 1.5 2
```

After the run, open the newly created directory under:

```
quant-research/outputs/runs/
```

Start with `manifest.json` to see what was tested, then `overview.png` and `frequency.png`, and finally inspect `summary.csv` / `signals.csv` if the visual result is interesting.

## Parallel-agent rule

New exploratory studies should prefer new files rather than modifying another study's script. Shared helpers belong in `quant-research/common/`. Generated results never use a single shared filename; every run gets its own folder.
