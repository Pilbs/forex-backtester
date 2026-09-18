const HOUR_MS = 60 * 60 * 1000;

function requirePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
}

function average(values) {
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createHourBar(candle, hourStart) {
    return {
        hourStart,
        open: candle.mid.open,
        high: candle.mid.high,
        low: candle.mid.low,
        close: candle.mid.close,
        trueRange: null,
    };
}

function updateHourBar(bar, candle) {
    bar.high = Math.max(bar.high, candle.mid.high);
    bar.low = Math.min(bar.low, candle.mid.low);
    bar.close = candle.mid.close;
}

export function createH1Structure({
    atrLength = 14,
    longRangeLookbackHours = 12,
    shortReturnLookbackHours = 6,
} = {}) {
    requirePositiveInteger(atrLength, "atrLength");
    requirePositiveInteger(longRangeLookbackHours, "longRangeLookbackHours");
    requirePositiveInteger(shortReturnLookbackHours, "shortReturnLookbackHours");

    const historyLimit = Math.max(
        atrLength + 2,
        longRangeLookbackHours + 2,
        shortReturnLookbackHours + 2
    );

    let completed = [];
    let currentHourStart = null;
    let currentBar = null;

    function reset() {
        completed = [];
        currentHourStart = null;
        currentBar = null;
    }

    function finalizeCurrentBar() {
        if (!currentBar) return;

        const previous = completed.at(-1) ?? null;
        const previousClose = previous?.close ?? currentBar.open;

        currentBar.trueRange = Math.max(
            currentBar.high - currentBar.low,
            Math.abs(currentBar.high - previousClose),
            Math.abs(currentBar.low - previousClose)
        );

        completed.push(currentBar);

        if (completed.length > historyLimit) {
            completed.splice(0, completed.length - historyLimit);
        }
    }

    function getState() {
        const latest = completed.at(-1) ?? null;

        if (!latest) {
            return {
                completedBars: completed.length,
                atr: null,
                shortReturnAtr: null,
                longRangePosition: null,
            };
        }

        const atrBars = completed.slice(-atrLength);
        const atr = atrBars.length === atrLength
            ? average(atrBars.map((bar) => bar.trueRange))
            : null;

        let shortReturnAtr = null;

        if (
            Number.isFinite(atr)
            && atr > 0
            && completed.length > shortReturnLookbackHours
        ) {
            const reference = completed[
                completed.length - 1 - shortReturnLookbackHours
            ];
            shortReturnAtr = (latest.close - reference.close) / atr;
        }

        let longRangePosition = null;

        if (completed.length >= longRangeLookbackHours) {
            const rangeBars = completed.slice(-longRangeLookbackHours);
            const high = Math.max(...rangeBars.map((bar) => bar.high));
            const low = Math.min(...rangeBars.map((bar) => bar.low));
            const width = high - low;

            if (width > 0) {
                longRangePosition = (latest.close - low) / width;
            }
        }

        return {
            completedBars: completed.length,
            atr,
            shortReturnAtr,
            longRangePosition,
        };
    }

    function next(candle) {
        const hourStart = Math.floor(candle.time / HOUR_MS) * HOUR_MS;

        if (currentHourStart === null) {
            currentHourStart = hourStart;
            currentBar = createHourBar(candle, hourStart);
            return getState();
        }

        if (hourStart !== currentHourStart) {
            finalizeCurrentBar();
            currentHourStart = hourStart;
            currentBar = createHourBar(candle, hourStart);
            return getState();
        }

        updateHourBar(currentBar, candle);
        return getState();
    }

    return {
        reset,
        next,
        getState,
    };
}
