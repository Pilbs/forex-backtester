# Strategy Porting Guide

This guide defines the contract for manually porting an automated trading strategy into the Forex Backtester.

The goal is not to make the backtest engine understand each strategy. The strategy should translate its own rules into the engine's generic trading instructions.

The same contract is intended to become the target for future strategy ingestion, including a possible Pine-to-internal-strategy translation layer.

# Strategy Structure

A strategy has two pieces:

1. A runtime strategy that receives candles and returns trading instructions.
2. A strategy definition that declares the strategy's configurable parameters.

A typical strategy folder should look like:

```text
src/strategies/my-strategy/
    my-strategy.js
    my-strategy-definition.js
```

Strategy-specific helpers can live in the same folder. Keep strategy logic out of `src/backtest`, `src/account`, `src/research` and `src/data`.

# Runtime Strategy Contract

The factory returns an object with:

```js
{
    name: "My Strategy",

    reset() {
        // Reset strategy and indicator state.
    },

    onCandle(context) {
        // Return null, one trade intent, or an array of trade intents.
    },
}
```

`onCandle(context)` is called only when that strategy candle is complete.

The strategy cannot access future candles.

# Strategy Context

The context currently exposes:

```text
context.candle
context.index
context.instrument
context.timeframe

context.account
context.position
context.openTrades
context.pendingOrders

context.getCandle(offset)
context.getRecentCandles(count)
```

Use `context.candle.mid` for strategy calculations unless the strategy specifically needs another price basis.

The account, position, trade and order information is a snapshot supplied to the strategy. The execution engine remains responsible for fills, P&L, margin and account state.

Examples:

```js
const previousCandle = context.getCandle(-1);

if (context.openTrades.length >= 2) {
    return null;
}

if (context.account.halted) {
    return null;
}
```

# Strategy State

State that belongs to the strategy can remain inside the strategy instance.

Examples:

```text
indicator state
session state
previous signal values
one-trade-per-day flags
setup state
```

Every stateful component must be reset in `reset()`.

Do not store strategy state globally.

# Indicator Library

Common indicators live under:

```text
src/indicators/
```

Import them through:

```js
import {
    createAtr,
    createEma,
    createRma,
    createRollingHighest,
    createRollingLowest,
    createRollingStandardDeviation,
    createRsi,
    createSma,
    crossover,
    crossunder,
    pivotHigh,
    pivotLow,
    trueRange,
} from "../../indicators/index.js";
```

The stateful indicators use:

```js
indicator.next(value)
indicator.reset()
indicator.value
```

ATR accepts a candle:

```js
const atr = createAtr(14);

const currentAtr = atr.next(context.candle);
```

EMA example:

```js
const ema = createEma(20);

const currentEma = ema.next(context.candle.mid.close);
```

Stateful indicators return `null` until enough data exists to seed the calculation.

`crossover()` and `crossunder()` return `false` while any required value is unavailable.

# Example Indicator Strategy

```js
import {
    createEma,
    crossover,
} from "../../indicators/index.js";

export function createEmaCrossStrategy({
    fastLength,
    slowLength,
}) {
    let fast;
    let slow;
    let previousFast;
    let previousSlow;

    function reset() {
        fast = createEma(fastLength);
        slow = createEma(slowLength);

        previousFast = null;
        previousSlow = null;
    }

    reset();

    return {
        name: "EMA Cross",

        reset,

        onCandle(context) {
            const close = context.candle.mid.close;

            const fastValue = fast.next(close);
            const slowValue = slow.next(close);

            const longSignal = crossover(
                previousFast,
                fastValue,
                previousSlow,
                slowValue
            );

            previousFast = fastValue;
            previousSlow = slowValue;

            if (!longSignal) {
                return null;
            }

            return {
                action: "ENTER",
                side: "LONG",

                size: {
                    type: "RISK_PERCENT",
                    value: 1,
                },

                stopLoss: {
                    type: "PIPS",
                    value: 10,
                },

                takeProfit: {
                    type: "PIPS",
                    value: 20,
                },
            };
        },
    };
}
```

# Strategy Definition

The matching definition declares the parameters the human research engine is allowed to configure and sweep.

```js
import {
    createEmaCrossStrategy,
} from "./ema-cross-strategy.js";

export const emaCrossDefinition = {
    id: "ema-cross",
    name: "EMA Cross",
    version: 1,

    createStrategy: createEmaCrossStrategy,

    parameters: {
        fastLength: {
            type: "integer",
            default: 10,
            min: 1,
        },

        slowLength: {
            type: "integer",
            default: 20,
            min: 2,
        },
    },

    validateConfig(config) {
        return config.fastLength >= config.slowLength
            ? ["fastLength must be lower than slowLength"]
            : [];
    },
};
```

Supported parameter types are:

```text
number
integer
string
boolean
```

Definitions can also use:

```text
default
required
min
max
options
sweepable: false
```

Unknown parameters are rejected rather than silently ignored.

# Trading Instructions

A strategy can return `null`, one instruction, or an array of instructions.

Supported actions:

```text
ENTER
EXIT
UPDATE_STOP
UPDATE_TARGET
CANCEL_ORDER
```

Supported entry/exit order types:

```text
MARKET
LIMIT
STOP
STOP_LIMIT
```

Supported time-in-force values:

```text
GTC
DAY
IOC
FOK
```

# Entry

Basic market entry:

```js
return {
    action: "ENTER",
    side: "LONG",
};
```

Limit entry:

```js
return {
    action: "ENTER",
    id: "pullback-order",
    entryId: "pullback-setup",
    side: "LONG",

    order: {
        type: "LIMIT",
        limitPrice: 1.1000,
        timeInForce: "GTC",
    },
};
```

# Position Sizing

Entry sizing supports:

```text
UNITS
CASH
PERCENT_EQUITY
RISK_PERCENT
```

Risk-percent sizing requires a stop because the engine derives units from the stop distance.

Example:

```js
size: {
    type: "RISK_PERCENT",
    value: 1,
}
```

# Stops and Targets

Stops and targets can be expressed as:

```text
PIPS
PRICE
PERCENT
```

Example:

```js
stopLoss: {
    type: "PIPS",
    value: 12,
},

takeProfit: {
    type: "PIPS",
    value: 30,
},
```

# Exits

Exit everything:

```js
return {
    action: "EXIT",
    target: {
        type: "ALL",
    },
};
```

Targeting supports:

```text
ALL
TRADE_ID
ENTRY_ID
SIDE
```

Partial exit:

```js
return {
    action: "EXIT",

    target: {
        type: "TRADE_ID",
        value: trade.id,
    },

    size: {
        type: "PERCENT_POSITION",
        value: 50,
    },

    reason: "SCALE_OUT",
};
```

# Updating Stops and Targets

Move a stop:

```js
return {
    action: "UPDATE_STOP",

    target: {
        type: "TRADE_ID",
        value: trade.id,
    },

    stopLoss: {
        type: "PRICE",
        value: newStopPrice,
    },
};
```

Remove a stop:

```js
return {
    action: "UPDATE_STOP",

    target: {
        type: "TRADE_ID",
        value: trade.id,
    },

    stopLoss: null,
};
```

Targets work the same way with `UPDATE_TARGET`.

This is how break-even stops, trailing logic and dynamic targets should be built: the strategy decides the new level and the generic engine applies it.

# Cancelling Orders

Cancel one order:

```js
return {
    action: "CANCEL_ORDER",
    orderId: "pullback-order",
};
```

Cancel all pending orders:

```js
return {
    action: "CANCEL_ORDER",
    all: true,
};
```

# Multiple Instructions on One Candle

A strategy can perform more than one action after the same completed candle:

```js
return [
    {
        action: "EXIT",
        target: {
            type: "TRADE_ID",
            value: trade.id,
        },
        size: {
            type: "PERCENT_POSITION",
            value: 50,
        },
        reason: "SCALE_OUT",
    },

    {
        action: "UPDATE_STOP",
        target: {
            type: "TRADE_ID",
            value: trade.id,
        },
        stopLoss: {
            type: "PRICE",
            value: trade.entryPrice,
        },
    },
];
```

# What Does Not Belong in a Strategy

Do not put these inside strategy code:

```text
D1 queries
historical data loading
broker API calls
fill simulation
spread/slippage calculations
commission calculations
account balance calculations
margin calculations
experiment loops
console reporting
JSON persistence
```

Those belong to the generic platform layers.

This separation is important for the long-term product because a manually ported strategy, a future parser-generated strategy and an AI-generated experiment must all be able to use the same engine.

# Porting Checklist

Before using a new strategy for research:

1. Put strategy-only logic in its own strategy folder.
2. Express all configurable values through the strategy definition.
3. Use MID prices for normal signal calculations.
4. Use the common indicator library where appropriate.
5. Reset all internal state and indicators in `reset()`.
6. Never access future candles.
7. Return generic trade intents rather than performing execution calculations.
8. Add a deterministic strategy test before running against D1.
9. Run `npm test`.
10. Run a small real-data integration test before a large parameter experiment.

# Future Pine Ingestion

The current manual JavaScript strategy contract is intentionally the target representation for future ingestion.

The intended future path is:

```text
Pine strategy
    ↓
parser / translator
    ↓
internal strategy + parameter definition
    ↓
generic backtest engine
    ↓
research engine
```

The engine should therefore continue to gain generic automated-trading capabilities rather than Pine- or ORB-specific special cases.
