import { getTimeframeDurationMs } from "../market/timeframe.js";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const FX_OPEN_MS_PER_WEEK = 5 * DAY_MS;

const newYorkClock = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

function parseTime(value, name) {
    const time = Date.parse(value);

    if (!Number.isFinite(time)) {
        throw new Error(`${name} must be a valid date/time`);
    }

    return time;
}

function estimateRows(durationMs, timeframe) {
    return Math.max(0, Math.ceil(durationMs / getTimeframeDurationMs(timeframe)));
}

function isFxMarketOpen(timestampMs) {
    const parts = Object.fromEntries(
        newYorkClock.formatToParts(new Date(timestampMs))
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    const weekday = parts.weekday;
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    const sessionBoundaryMinutes = 17 * 60;

    if (weekday === "Sat") return false;
    if (weekday === "Sun") return minutes >= sessionBoundaryMinutes;
    if (weekday === "Fri") return minutes < sessionBoundaryMinutes;

    return true;
}

function estimateFxRows(fromMs, toMs, timeframe) {
    const timeframeMs = getTimeframeDurationMs(timeframe);
    const durationMs = toMs - fromMs;

    if (durationMs <= 0) return 0;

    // Any complete seven-day span contains one full 24x5 FX trading week.
    // Count those in O(1), then inspect only the final partial week using the
    // New York 17:00 Sunday-open / Friday-close boundary so DST is respected.
    const fullWeeks = Math.floor(durationMs / WEEK_MS);
    const rowsPerFullWeek = Math.ceil(FX_OPEN_MS_PER_WEEK / timeframeMs);
    let rows = fullWeeks * rowsPerFullWeek;

    const remainderStart = fromMs + fullWeeks * WEEK_MS;

    for (let timestamp = remainderStart; timestamp < toMs; timestamp += timeframeMs) {
        if (isFxMarketOpen(timestamp)) {
            rows++;
        }
    }

    return rows;
}

function estimateMarketRows(fromMs, toMs, timeframe, instrument) {
    // Current cloud commissioning is FX-only (EUR_USD). Keep the estimator
    // explicit rather than pretending every future market follows FX hours.
    if (instrument === "EUR_USD") {
        return estimateFxRows(fromMs, toMs, timeframe);
    }

    return estimateRows(toMs - fromMs, timeframe);
}

export function estimateResearchUsage(config, plan) {
    const fromMs = parseTime(config.market.from, "market.from");
    const toMs = parseTime(config.market.to, "market.to");
    const durationMs = toMs - fromMs;

    if (durationMs <= 0) {
        throw new Error("market.from must be before market.to");
    }

    const instrument = config.market.instrument;
    const strategyRows = estimateMarketRows(
        fromMs,
        toMs,
        config.market.strategyTimeframe,
        instrument
    );
    const executionRows = config.market.executionTimeframe === config.market.strategyTimeframe
        ? 0
        : estimateMarketRows(
            fromMs,
            toMs,
            config.market.executionTimeframe,
            instrument
        );

    const estimatedDatasetRows = strategyRows + executionRows;
    const requestedRuns = plan.research.requestedCombinations;
    const validRuns = plan.research.validCombinations;

    return {
        dateRangeDays: Number((durationMs / DAY_MS).toFixed(2)),
        estimatedStrategyRows: strategyRows,
        estimatedExecutionRows: executionRows,
        estimatedDatasetRows,
        requestedRuns,
        validRuns,
        estimatedCandleEvaluations: estimatedDatasetRows * validRuns,
        note: (
            instrument === "EUR_USD"
                ? "Planning estimate uses EUR/USD 24x5 FX market hours (17:00 New York Sunday to 17:00 Friday). Holidays and no-tick gaps can make actual D1 rows lower."
                : "Planning estimate only. Actual D1 rows read and compute usage are measured at execution time."
        ),
    };
}
