import { createSma } from "../../indicators/index.js";

export function createSimpleSmaStrategy({
    smaLength = 20,
} = {}) {
    const sma = createSma(smaLength);

    function reset() {
        sma.reset();
    }

    function onCandle(context) {
        const close = context.candle.mid.close;
        const smaValue = sma.next(close);

        if (smaValue === null) {
            return null;
        }

        const longTradeOpen = context.openTrades.some(
            (trade) => trade.side === "LONG"
        );

        if (longTradeOpen) {
            if (close >= smaValue) {
                return null;
            }

            return {
                action: "EXIT",
                target: {
                    type: "SIDE",
                    value: "LONG",
                },
                reason: "SMA_CLOSE_BELOW",
                metadata: {
                    strategy: "SIMPLE_SMA",
                    smaLength,
                    sma: smaValue,
                    close,
                },
            };
        }

        if (context.openTrades.length > 0 || close <= smaValue) {
            return null;
        }

        return {
            action: "ENTER",
            side: "LONG",
            metadata: {
                strategy: "SIMPLE_SMA",
                smaLength,
                sma: smaValue,
                close,
            },
        };
    }

    return {
        name: "Simple SMA",
        reset,
        onCandle,
    };
}
