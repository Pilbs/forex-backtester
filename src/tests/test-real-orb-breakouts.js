import "dotenv/config";

import {
    getCandles,
} from "../data/candle-reader.js";

import {
    createDailyOpeningRange,
} from "../strategies/orb/daily-opening-range.js";

import {
    createBreakoutDetector,
} from "../strategies/orb/breakout-detector.js";

import {
    getZonedDateKey,
} from "../time/zoned-time.js";

async function main() {
    const timeZone =
        "America/New_York";

    console.log(
        "Loading real EUR/USD candles..."
    );

    const candles = await getCandles({
        instrument: "EUR_USD",
        granularity: "M1",
        from: "2026-08-27T00:00:00Z",
        to: "2026-08-29T00:00:00Z",
    });

    console.log(
        `Loaded ${candles.length} candles`
    );

    const dailyRange =
        createDailyOpeningRange({
            startHour: 8,
            startMinute: 15,
            durationMinutes: 60,
            timeZone,
        });

    const detector =
        createBreakoutDetector();

    const breakouts = [];

    for (const candle of candles) {
        dailyRange.onCandle(candle);

        const rangeState =
            dailyRange.getState();

        const candleDate =
            getZonedDateKey(
                candle.time,
                timeZone
            );

        if (
            rangeState.date !==
            candleDate
        ) {
            continue;
        }

        const breakout =
            detector.onCandle({
                candle,
                rangeState,
            });

        if (breakout) {
            breakouts.push(breakout);
        }
    }

    console.log("");
    console.log("ORB Breakouts");

    console.table(
        breakouts.map((breakout) => ({
            date: breakout.date,

            timeNewYork: new Intl.DateTimeFormat(
                "en-GB",
                {
                    timeZone,
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                }
            ).format(
                new Date(breakout.time)
            ),

            timeUTC: new Date(
                breakout.time
            ).toISOString(),

            direction:
                breakout.direction,

            rangeHigh:
                breakout.rangeHigh,

            rangeLow:
                breakout.rangeLow,

            candleHigh:
                breakout.candleHigh,

            candleLow:
                breakout.candleLow,
        }))
    );

    console.log("");
    console.log(
        `${breakouts.length} first breakouts found.`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});