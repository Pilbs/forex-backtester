import { resolveAccountConfig, resolveQuoteToAccountRate } from "../account/account-config.js";
import { createAccountLedger } from "../account/account-state.js";
import { calculateEntryUnits } from "../account/position-sizing.js";
import { getInstrumentMetadata } from "../market/instrument-metadata.js";
import { getTimeframeDurationMs } from "../market/timeframe.js";
import { validateStrategy } from "../strategies/strategy-interface.js";
import { normalizeTradeIntents } from "../strategies/trade-intent.js";
import { getZonedDateKey } from "../time/zoned-time.js";
import { resolveExecutionPolicy } from "./execution-policy.js";
import { createStrategyContext } from "./strategy-context.js";

function validateCandles(candles, name) {
    if (!Array.isArray(candles)) {
        throw new Error(`${name} must be an array`);
    }

    if (candles.length === 0) {
        throw new Error(`No ${name} supplied to backtest`);
    }

    let previousTime = null;

    for (const candle of candles) {
        if (!Number.isFinite(candle.time)) {
            throw new Error(`${name} contains an invalid time`);
        }

        if (previousTime !== null && candle.time <= previousTime) {
            throw new Error(
                `${name} are not chronological at ${new Date(candle.time).toISOString()}`
            );
        }

        previousTime = candle.time;
    }
}

function calculatePnlPips({ side, entryPrice, exitPrice, pipSize }) {
    const priceDifference = side === "LONG"
        ? exitPrice - entryPrice
        : entryPrice - exitPrice;

    return priceDifference / pipSize;
}

function resolveLevel({ level, side, entryPrice, pipSize, purpose }) {
    if (level === null || level === undefined) {
        return null;
    }

    if (level.type === "PRICE") {
        return level.value;
    }

    const direction = side === "LONG" ? 1 : -1;
    const distance = level.type === "PIPS"
        ? level.value * pipSize
        : entryPrice * (level.value / 100);

    if (purpose === "STOP_LOSS") {
        return entryPrice - direction * distance;
    }

    if (purpose === "TAKE_PROFIT") {
        return entryPrice + direction * distance;
    }

    throw new Error(`Unknown level purpose: ${purpose}`);
}

function applySlippage({ price, side, purpose, slippagePips, pipSize }) {
    if (slippagePips === 0) {
        return price;
    }

    const distance = slippagePips * pipSize;

    if (purpose === "ENTRY") {
        return side === "LONG" ? price + distance : price - distance;
    }

    return side === "LONG" ? price - distance : price + distance;
}

function getTargetTrades(openTrades, target) {
    if (!target || target.type === "ALL") {
        return [...openTrades];
    }

    if (target.type === "TRADE_ID") {
        return openTrades.filter((trade) => trade.id === target.value);
    }

    if (target.type === "ENTRY_ID") {
        return openTrades.filter((trade) => trade.entryId === target.value);
    }

    if (target.type === "SIDE") {
        return openTrades.filter((trade) => trade.side === target.value);
    }

    return [];
}

function tradeSnapshot(trade) {
    return {
        id: trade.id,
        entryId: trade.entryId,
        side: trade.side,
        entryTime: trade.entryTime,
        entryPrice: trade.entryPrice,
        originalUnits: trade.originalUnits,
        remainingUnits: trade.remainingUnits,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        highestPrice: trade.highestPrice,
        lowestPrice: trade.lowestPrice,
        barsHeld: trade.barsHeld,
        unrealizedPips: trade.unrealizedPips,
        metadata: trade.metadata,
    };
}

function orderSnapshot(order) {
    return {
        id: order.id,
        action: order.action,
        entryId: order.entryId,
        side: order.side,
        type: order.type,
        timeInForce: order.timeInForce,
        limitPrice: order.limitPrice,
        stopPrice: order.stopPrice,
        expiresAt: order.expiresAt,
        createdTime: order.createdTime,
        status: order.status,
        activated: order.activated,
        target: order.target,
        size: order.size,
        metadata: order.metadata,
    };
}

function getEntryPriceSeries(candle, side) {
    return side === "LONG" ? candle.ask : candle.bid;
}

function getExitPriceSeries(candle, side) {
    return side === "LONG" ? candle.bid : candle.ask;
}

function detectEntryFill(order, candle) {
    const prices = getEntryPriceSeries(candle, order.side);

    if (order.type === "LIMIT") {
        if (order.side === "LONG") {
            if (prices.open <= order.limitPrice) return { price: prices.open, timing: "OPEN", fillType: "LIMIT" };
            if (prices.low <= order.limitPrice) return { price: order.limitPrice, timing: "INTRABAR", fillType: "LIMIT" };
        } else {
            if (prices.open >= order.limitPrice) return { price: prices.open, timing: "OPEN", fillType: "LIMIT" };
            if (prices.high >= order.limitPrice) return { price: order.limitPrice, timing: "INTRABAR", fillType: "LIMIT" };
        }

        return null;
    }

    if (order.type === "STOP") {
        if (order.side === "LONG") {
            if (prices.open >= order.stopPrice) return { price: prices.open, timing: "OPEN", fillType: "STOP" };
            if (prices.high >= order.stopPrice) return { price: order.stopPrice, timing: "INTRABAR", fillType: "STOP" };
        } else {
            if (prices.open <= order.stopPrice) return { price: prices.open, timing: "OPEN", fillType: "STOP" };
            if (prices.low <= order.stopPrice) return { price: order.stopPrice, timing: "INTRABAR", fillType: "STOP" };
        }

        return null;
    }

    return null;
}

function detectStopLimitActivation(order, candle) {
    const prices = getEntryPriceSeries(candle, order.side);

    if (order.side === "LONG") {
        return prices.open >= order.stopPrice || prices.high >= order.stopPrice;
    }

    return prices.open <= order.stopPrice || prices.low <= order.stopPrice;
}

function detectStopLimitFill(order, candle) {
    const prices = getEntryPriceSeries(candle, order.side);

    if (order.side === "LONG") {
        if (prices.open <= order.limitPrice) return { price: prices.open, timing: "OPEN", fillType: "STOP_LIMIT" };
        if (prices.low <= order.limitPrice) return { price: order.limitPrice, timing: "INTRABAR", fillType: "STOP_LIMIT" };
    } else {
        if (prices.open >= order.limitPrice) return { price: prices.open, timing: "OPEN", fillType: "STOP_LIMIT" };
        if (prices.high >= order.limitPrice) return { price: order.limitPrice, timing: "INTRABAR", fillType: "STOP_LIMIT" };
    }

    return null;
}

function detectExitFill(order, candle, side) {
    const prices = getExitPriceSeries(candle, side);

    if (order.type === "LIMIT") {
        if (side === "LONG") {
            if (prices.open >= order.limitPrice) return { price: prices.open, timing: "OPEN", fillType: "LIMIT" };
            if (prices.high >= order.limitPrice) return { price: order.limitPrice, timing: "INTRABAR", fillType: "LIMIT" };
        } else {
            if (prices.open <= order.limitPrice) return { price: prices.open, timing: "OPEN", fillType: "LIMIT" };
            if (prices.low <= order.limitPrice) return { price: order.limitPrice, timing: "INTRABAR", fillType: "LIMIT" };
        }

        return null;
    }

    if (order.type === "STOP") {
        if (side === "LONG") {
            if (prices.open <= order.stopPrice) return { price: prices.open, timing: "OPEN", fillType: "STOP" };
            if (prices.low <= order.stopPrice) return { price: order.stopPrice, timing: "INTRABAR", fillType: "STOP" };
        } else {
            if (prices.open >= order.stopPrice) return { price: prices.open, timing: "OPEN", fillType: "STOP" };
            if (prices.high >= order.stopPrice) return { price: order.stopPrice, timing: "INTRABAR", fillType: "STOP" };
        }

        return null;
    }

    return null;
}

function detectExitStopLimitActivation(order, candle, side) {
    const prices = getExitPriceSeries(candle, side);

    if (side === "LONG") {
        return prices.open <= order.stopPrice || prices.low <= order.stopPrice;
    }

    return prices.open >= order.stopPrice || prices.high >= order.stopPrice;
}

function detectExitStopLimitFill(order, candle, side) {
    const prices = getExitPriceSeries(candle, side);

    if (side === "LONG") {
        if (prices.open >= order.limitPrice) return { price: prices.open, timing: "OPEN", fillType: "STOP_LIMIT" };
        if (prices.high >= order.limitPrice) return { price: order.limitPrice, timing: "INTRABAR", fillType: "STOP_LIMIT" };
    } else {
        if (prices.open <= order.limitPrice) return { price: prices.open, timing: "OPEN", fillType: "STOP_LIMIT" };
        if (prices.low <= order.limitPrice) return { price: order.limitPrice, timing: "INTRABAR", fillType: "STOP_LIMIT" };
    }

    return null;
}

export function runBacktest({
    strategyCandles,
    executionCandles,
    strategy,
    pipSize,
    instrument,
    strategyTimeframe,
    executionTimeframe,
    accountConfig = {},
    executionPolicy = {},
    captureEquityCurve = false,
}) {
    validateCandles(strategyCandles, "strategyCandles");
    validateCandles(executionCandles, "executionCandles");

    if (!Number.isFinite(pipSize) || pipSize <= 0) {
        throw new Error("pipSize must be a positive number");
    }

    validateStrategy(strategy);

    if (strategy.reset) {
        strategy.reset();
    }

    const instrumentMetadata = getInstrumentMetadata(instrument);
    const resolvedAccountConfig = resolveAccountConfig(accountConfig, {
        defaultCurrency: instrumentMetadata.quoteCurrency,
    });
    const quoteToAccountRate = resolveQuoteToAccountRate({
        accountConfig: resolvedAccountConfig,
        instrumentMetadata,
    });
    const resolvedExecutionPolicy = resolveExecutionPolicy(executionPolicy);
    const accountLedger = createAccountLedger({
        accountConfig: resolvedAccountConfig,
        quoteToAccountRate,
    });
    const strategyDurationMs = getTimeframeDurationMs(strategyTimeframe);

    let strategyIndex = 0;
    let orderCounter = 0;
    let tradeCounter = 0;
    let fillCounter = 0;

    const signals = [];
    const orders = [];
    const pendingOrders = [];
    const rejectedOrders = [];
    const fills = [];
    const trades = [];
    const openTrades = [];
    const riskEvents = [];
    const equityCurve = [];
    const fixedCommissionChargedOrders = new Set();

    function nextOrderId() {
        orderCounter++;
        return `order-${orderCounter}`;
    }

    function nextTradeId() {
        tradeCounter++;
        return `trade-${tradeCounter}`;
    }

    function nextFillId() {
        fillCounter++;
        return `fill-${fillCounter}`;
    }

    function calculateCommission({ orderId, units, price }) {
        const commission = resolvedExecutionPolicy.commission;

        if (commission.type === "NONE" || commission.value === 0) {
            return 0;
        }

        if (commission.type === "PIPS_PER_SIDE") {
            return units * pipSize * commission.value * quoteToAccountRate;
        }

        if (commission.type === "PERCENT_NOTIONAL") {
            return units * price * quoteToAccountRate * (commission.value / 100);
        }

        if (fixedCommissionChargedOrders.has(orderId)) {
            return 0;
        }

        fixedCommissionChargedOrders.add(orderId);
        return commission.value;
    }

    function rejectOrder(order, reason) {
        order.status = "REJECTED";
        order.rejectionReason = reason;
        rejectedOrders.push({
            orderId: order.id,
            time: order.createdTime,
            reason,
            action: order.action,
            side: order.side ?? null,
        });
    }

    function cancelOrder(order, reason, time) {
        if (order.status !== "PENDING" && order.status !== "ACTIVATED") {
            return;
        }

        order.status = "CANCELLED";
        order.cancelReason = reason;
        order.cancelTime = time;
    }

    function removeFinishedPendingOrders() {
        for (let index = pendingOrders.length - 1; index >= 0; index--) {
            const status = pendingOrders[index].status;

            if (status !== "PENDING" && status !== "ACTIVATED") {
                pendingOrders.splice(index, 1);
            }
        }
    }

    function createOrder(intent, decisionTime, sourceTime, executionIndex) {
        const orderConfig = intent.order ?? { type: "MARKET" };
        const order = {
            id: intent.id ?? nextOrderId(),
            action: intent.action,
            entryId: intent.entryId ?? null,
            side: intent.side ?? null,
            type: orderConfig.type,
            timeInForce: orderConfig.timeInForce ?? resolvedExecutionPolicy.defaultTimeInForce,
            limitPrice: orderConfig.limitPrice ?? null,
            stopPrice: orderConfig.stopPrice ?? null,
            expiresAt: orderConfig.expiresAt ?? null,
            target: intent.target ?? null,
            size: intent.size ?? null,
            stopLoss: intent.stopLoss ?? null,
            takeProfit: intent.takeProfit ?? null,
            reason: intent.reason ?? null,
            metadata: intent.metadata ?? null,
            createdTime: decisionTime,
            sourceTime,
            createdDateKey: getZonedDateKey(decisionTime, resolvedAccountConfig.riskTimeZone),
            firstEligibleExecutionIndex: executionIndex,
            status: "PENDING",
            activated: false,
            activationExecutionIndex: null,
            filledUnits: 0,
        };

        orders.push(order);
        return order;
    }

    function getAccountSnapshot(candle, point = "open") {
        return accountLedger.snapshot({
            openTrades,
            candle,
            point,
            time: candle.time,
        });
    }

    function getStrategyTradeSnapshots(candle) {
        return openTrades.map((trade) => {
            const markPrice = trade.side === "LONG" ? candle.bid.open : candle.ask.open;

            return {
                ...tradeSnapshot(trade),
                unrealizedPips: Number(calculatePnlPips({
                    side: trade.side,
                    entryPrice: trade.entryPrice,
                    exitPrice: markPrice,
                    pipSize,
                }).toFixed(4)),
            };
        });
    }

    function checkNewTradeRisk({ side, units, entryPrice, candle }) {
        if (accountLedger.isHalted()) {
            return accountLedger.getHaltReason() ?? "ACCOUNT_HALTED";
        }

        const risk = resolvedAccountConfig.risk;
        const snapshot = getAccountSnapshot(candle, "open");
        const sideTradeCount = openTrades.filter((trade) => trade.side === side).length;
        const grossUnits = snapshot.position.grossUnits + units;
        const addedExposure = units * entryPrice * quoteToAccountRate;
        const predictedExposure = snapshot.grossExposure + addedExposure;
        const predictedMargin = predictedExposure / resolvedAccountConfig.leverage;
        const predictedMarginUsage = snapshot.equity > 0
            ? predictedMargin / snapshot.equity * 100
            : Infinity;

        if (risk.maxOpenTrades !== null && openTrades.length + 1 > risk.maxOpenTrades) {
            return "MAX_OPEN_TRADES";
        }

        if (risk.maxTradesPerSide !== null && sideTradeCount + 1 > risk.maxTradesPerSide) {
            return "MAX_TRADES_PER_SIDE";
        }

        if (risk.maxPositionUnits !== null && grossUnits > risk.maxPositionUnits) {
            return "MAX_POSITION_UNITS";
        }

        if (risk.maxGrossExposure !== null && predictedExposure > risk.maxGrossExposure) {
            return "MAX_GROSS_EXPOSURE";
        }

        if (
            risk.maxMarginUsagePercent !== null &&
            predictedMarginUsage > risk.maxMarginUsagePercent
        ) {
            return "MAX_MARGIN_USAGE";
        }

        if (resolvedExecutionPolicy.rejectOnInsufficientMargin && predictedMargin > snapshot.equity) {
            return "INSUFFICIENT_MARGIN";
        }

        return null;
    }

    function createEntryFill({ order, trade, units, price, time, commissionAccount }) {
        const fill = {
            id: nextFillId(),
            orderId: order.id,
            tradeId: trade.id,
            type: "ENTRY",
            side: trade.side === "LONG" ? "BUY" : "SELL",
            time,
            price,
            units,
            commissionAccount,
        };

        fills.push(fill);
        return fill;
    }

    function finalizeTrade(trade) {
        const totalExitedUnits = trade.exitFills.reduce((total, fill) => total + fill.units, 0);
        const weightedExitPrice = totalExitedUnits > 0
            ? trade.exitFills.reduce((total, fill) => total + fill.price * fill.units, 0) / totalExitedUnits
            : trade.entryPrice;
        const weightedPnlPips = totalExitedUnits > 0
            ? trade.exitFills.reduce((total, fill) => total + fill.pnlPips * fill.units, 0) / totalExitedUnits
            : 0;
        const lastExitFill = trade.exitFills.at(-1);
        const commissionAccount = trade.entryCommissionAccount + trade.exitCommissionAccount;
        const netPnlAccount = trade.realizedPnlAccount - commissionAccount;

        const completedTrade = {
            ...trade,
            exitTime: lastExitFill.time,
            exitPrice: weightedExitPrice,
            exitReason: lastExitFill.reason,
            exitReasons: [...new Set(trade.exitFills.map((fill) => fill.reason))],
            pnlPips: Number(weightedPnlPips.toFixed(4)),
            grossPnlAccount: trade.realizedPnlAccount,
            commissionAccount,
            pnlAccount: netPnlAccount,
            result: netPnlAccount > 0
                ? "WIN"
                : netPnlAccount < 0
                    ? "LOSS"
                    : "BREAKEVEN",
        };

        delete completedTrade.remainingUnits;
        delete completedTrade.realizedPnlAccount;
        delete completedTrade.exitCommissionAccount;
        delete completedTrade.riskEligibleExecutionIndex;
        delete completedTrade.entryExecutionIndex;

        trades.push(completedTrade);
    }

    function closeTradeUnits({
        trade,
        units,
        price,
        time,
        reason,
        orderId,
    }) {
        let closeUnits = Math.min(units, trade.remainingUnits);

        if (closeUnits < trade.remainingUnits) {
            const unitStep = instrumentMetadata.unitStep;
            closeUnits = Math.floor(closeUnits / unitStep + 1e-9) * unitStep;
        }

        if (closeUnits <= 0) {
            return 0;
        }

        const pnlPips = calculatePnlPips({
            side: trade.side,
            entryPrice: trade.entryPrice,
            exitPrice: price,
            pipSize,
        });
        const grossPnlAccount = pnlPips * pipSize * closeUnits * quoteToAccountRate;
        const commissionAccount = calculateCommission({
            orderId,
            units: closeUnits,
            price,
        });

        accountLedger.recordRealizedPnl(grossPnlAccount);
        accountLedger.recordCommission(commissionAccount);

        const fill = {
            id: nextFillId(),
            orderId,
            tradeId: trade.id,
            type: "EXIT",
            side: trade.side === "LONG" ? "SELL" : "BUY",
            time,
            price,
            units: closeUnits,
            reason,
            pnlPips: Number(pnlPips.toFixed(4)),
            grossPnlAccount,
            commissionAccount,
        };

        fills.push(fill);
        trade.exitFills.push(fill);
        trade.remainingUnits = Number((trade.remainingUnits - closeUnits).toFixed(8));
        trade.realizedPnlAccount += grossPnlAccount;
        trade.exitCommissionAccount += commissionAccount;

        if (trade.remainingUnits <= 0) {
            const index = openTrades.indexOf(trade);
            if (index >= 0) {
                openTrades.splice(index, 1);
            }
            finalizeTrade(trade);
        }

        return closeUnits;
    }

    function closeTargetTrades({
        target,
        size,
        price,
        time,
        reason,
        orderId,
    }) {
        const selectedTrades = getTargetTrades(openTrades, target)
            .sort((a, b) => a.entryTime - b.entryTime);

        if (selectedTrades.length === 0) {
            return 0;
        }

        let totalClosedUnits = 0;

        if (!size) {
            for (const trade of [...selectedTrades]) {
                totalClosedUnits += closeTradeUnits({
                    trade,
                    units: trade.remainingUnits,
                    price,
                    time,
                    reason,
                    orderId,
                });
            }

            return totalClosedUnits;
        }

        if (size.type === "PERCENT_POSITION") {
            for (const trade of [...selectedTrades]) {
                const requestedUnits = trade.remainingUnits * (size.value / 100);
                totalClosedUnits += closeTradeUnits({
                    trade,
                    units: requestedUnits,
                    price,
                    time,
                    reason,
                    orderId,
                });
            }

            return totalClosedUnits;
        }

        let remainingUnits = size.value;

        for (const trade of [...selectedTrades]) {
            if (remainingUnits <= 0) {
                break;
            }

            const closedUnits = closeTradeUnits({
                trade,
                units: remainingUnits,
                price,
                time,
                reason,
                orderId,
            });

            remainingUnits -= closedUnits;
            totalClosedUnits += closedUnits;
        }

        return totalClosedUnits;
    }

    function openTrade({
        order,
        units,
        entryPrice,
        candle,
        executionIndex,
        fillTiming,
    }) {
        const stopLoss = resolveLevel({
            level: order.stopLoss,
            side: order.side,
            entryPrice,
            pipSize,
            purpose: "STOP_LOSS",
        });
        const takeProfit = resolveLevel({
            level: order.takeProfit,
            side: order.side,
            entryPrice,
            pipSize,
            purpose: "TAKE_PROFIT",
        });
        const riskReason = checkNewTradeRisk({
            side: order.side,
            units,
            entryPrice,
            candle,
        });

        if (riskReason) {
            return { openedUnits: 0, rejectionReason: riskReason };
        }

        const trade = {
            id: nextTradeId(),
            entryId: order.entryId,
            orderId: order.id,
            side: order.side,
            signalTime: order.sourceTime,
            decisionTime: order.createdTime,
            entryTime: candle.time,
            entryPrice,
            originalUnits: units,
            remainingUnits: units,
            stopLoss,
            takeProfit,
            highestPrice: candle.mid.open,
            lowestPrice: candle.mid.open,
            barsHeld: 0,
            unrealizedPips: 0,
            metadata: order.metadata,
            entryCommissionAccount: 0,
            exitCommissionAccount: 0,
            realizedPnlAccount: 0,
            exitFills: [],
            entryExecutionIndex: executionIndex,
            riskEligibleExecutionIndex: fillTiming === "INTRABAR"
                ? executionIndex + 1
                : executionIndex,
        };
        const commissionAccount = calculateCommission({
            orderId: order.id,
            units,
            price: entryPrice,
        });

        accountLedger.recordCommission(commissionAccount);
        trade.entryCommissionAccount = commissionAccount;
        openTrades.push(trade);
        createEntryFill({
            order,
            trade,
            units,
            price: entryPrice,
            time: candle.time,
            commissionAccount,
        });

        return { openedUnits: units, trade };
    }

    function fillEntryOrder({ order, rawPrice, candle, executionIndex, fillTiming, fillType }) {
        const entryPrice = applySlippage({
            price: rawPrice,
            side: order.side,
            purpose: "ENTRY",
            slippagePips: fillType === "STOP" || order.type === "MARKET"
                ? resolvedExecutionPolicy.slippagePips
                : 0,
            pipSize,
        });
        const snapshot = getAccountSnapshot(candle, "open");
        const stopLossPrice = resolveLevel({
            level: order.stopLoss,
            side: order.side,
            entryPrice,
            pipSize,
            purpose: "STOP_LOSS",
        });

        let units;

        try {
            units = calculateEntryUnits({
                size: order.size,
                defaultSizing: resolvedAccountConfig.defaultSizing,
                entryPrice,
                stopLossPrice,
                equity: snapshot.equity,
                quoteToAccountRate,
                unitStep: instrumentMetadata.unitStep,
                minimumUnits: instrumentMetadata.minimumUnits,
            });
        } catch (error) {
            rejectOrder(order, error.message);
            return;
        }

        let remainingUnits = units;
        let nettedUnits = 0;

        if (resolvedAccountConfig.positionMode === "NETTING") {
            const oppositeSide = order.side === "LONG" ? "SHORT" : "LONG";
            const oppositeTrades = openTrades
                .filter((trade) => trade.side === oppositeSide)
                .sort((a, b) => a.entryTime - b.entryTime);

            for (const trade of [...oppositeTrades]) {
                if (remainingUnits <= 0) {
                    break;
                }

                const closedUnits = closeTradeUnits({
                    trade,
                    units: remainingUnits,
                    price: entryPrice,
                    time: candle.time,
                    reason: "NETTING",
                    orderId: order.id,
                });

                remainingUnits -= closedUnits;
                nettedUnits += closedUnits;
            }
        }

        let openedUnits = 0;
        let rejectionReason = null;

        if (remainingUnits > 0) {
            const opened = openTrade({
                order,
                units: remainingUnits,
                entryPrice,
                candle,
                executionIndex,
                fillTiming,
            });

            openedUnits = opened.openedUnits;
            rejectionReason = opened.rejectionReason ?? null;
        }

        order.filledUnits = nettedUnits + openedUnits;

        if (rejectionReason && order.filledUnits === 0) {
            rejectOrder(order, rejectionReason);
            return;
        }

        if (rejectionReason) {
            order.status = "PARTIALLY_FILLED";
            order.rejectionReason = rejectionReason;
            rejectedOrders.push({
                orderId: order.id,
                time: candle.time,
                reason: rejectionReason,
                action: order.action,
                side: order.side,
                partialFill: true,
            });
            return;
        }

        order.status = "FILLED";
        order.fillTime = candle.time;
        order.fillPrice = entryPrice;
    }

    function marketExitPrice(trade, candle, point = "open") {
        const prices = getExitPriceSeries(candle, trade.side);

        return applySlippage({
            price: prices[point],
            side: trade.side,
            purpose: "EXIT",
            slippagePips: resolvedExecutionPolicy.slippagePips,
            pipSize,
        });
    }

    function executeMarketExit(order, candle) {
        const selectedTrades = getTargetTrades(openTrades, order.target);

        if (selectedTrades.length === 0) {
            order.status = "CANCELLED";
            order.cancelReason = "NO_MATCHING_TRADES";
            order.cancelTime = candle.time;
            return;
        }

        const sides = [...new Set(selectedTrades.map((trade) => trade.side))];

        if (sides.length > 1) {
            let closedUnits = 0;

            for (const side of sides) {
                const price = marketExitPrice(
                    selectedTrades.find((trade) => trade.side === side),
                    candle
                );
                const sideTarget = { type: "SIDE", value: side };
                closedUnits += closeTargetTrades({
                    target: order.target?.type === "ALL" || !order.target ? sideTarget : order.target,
                    size: order.size,
                    price,
                    time: candle.time,
                    reason: order.reason ?? "STRATEGY_EXIT",
                    orderId: order.id,
                });
            }

            order.filledUnits = closedUnits;
            order.status = closedUnits > 0 ? "FILLED" : "CANCELLED";
            order.fillTime = candle.time;
            return;
        }

        const price = marketExitPrice(selectedTrades[0], candle);
        const closedUnits = closeTargetTrades({
            target: order.target,
            size: order.size,
            price,
            time: candle.time,
            reason: order.reason ?? "STRATEGY_EXIT",
            orderId: order.id,
        });

        order.filledUnits = closedUnits;
        order.status = closedUnits > 0 ? "FILLED" : "CANCELLED";
        order.fillTime = candle.time;
        order.fillPrice = price;
    }

    function updateTradeLevel(intent, fieldName) {
        const selectedTrades = getTargetTrades(openTrades, intent.target);
        const purpose = fieldName === "stopLoss" ? "STOP_LOSS" : "TAKE_PROFIT";

        for (const trade of selectedTrades) {
            trade[fieldName] = resolveLevel({
                level: intent[fieldName],
                side: trade.side,
                entryPrice: trade.entryPrice,
                pipSize,
                purpose,
            });
        }
    }

    function processIntent(intent, sourceTime, decisionTime, executionCandle, executionIndex) {
        if (intent.action === "CANCEL_ORDER") {
            for (const order of pendingOrders) {
                if (intent.all === true || order.id === intent.orderId) {
                    cancelOrder(order, "STRATEGY_CANCEL", executionCandle.time);
                }
            }
            removeFinishedPendingOrders();
            return;
        }

        if (intent.action === "UPDATE_STOP") {
            updateTradeLevel(intent, "stopLoss");
            return;
        }

        if (intent.action === "UPDATE_TARGET") {
            updateTradeLevel(intent, "takeProfit");
            return;
        }

        const order = createOrder(intent, decisionTime, sourceTime, executionIndex);

        if (order.type !== "MARKET") {
            pendingOrders.push(order);
            return;
        }

        if (intent.action === "ENTER") {
            const prices = getEntryPriceSeries(executionCandle, intent.side);
            fillEntryOrder({
                order,
                rawPrice: prices.open,
                candle: executionCandle,
                executionIndex,
                fillTiming: "OPEN",
                fillType: "MARKET",
            });
            return;
        }

        executeMarketExit(order, executionCandle);
    }

    function expirePendingOrders(candle) {
        const dayKey = getZonedDateKey(candle.time, resolvedAccountConfig.riskTimeZone);

        for (const order of pendingOrders) {
            if (order.expiresAt !== null && candle.time >= order.expiresAt) {
                cancelOrder(order, "EXPIRED", candle.time);
                continue;
            }

            if (order.timeInForce === "DAY" && dayKey !== order.createdDateKey) {
                cancelOrder(order, "DAY_EXPIRED", candle.time);
            }
        }

        removeFinishedPendingOrders();
    }

    function processPendingEntryOrder(order, candle, executionIndex) {
        if (order.type === "STOP_LIMIT") {
            if (!order.activated) {
                if (!detectStopLimitActivation(order, candle)) {
                    return false;
                }

                order.activated = true;
                order.status = "ACTIVATED";
                order.activationTime = candle.time;
                order.activationExecutionIndex = executionIndex;
                return false;
            }

            if (executionIndex <= order.activationExecutionIndex) {
                return false;
            }

            const fill = detectStopLimitFill(order, candle);

            if (!fill) {
                return false;
            }

            fillEntryOrder({
                order,
                rawPrice: fill.price,
                candle,
                executionIndex,
                fillTiming: fill.timing,
                fillType: fill.fillType,
            });
            return order.status === "FILLED" || order.status === "PARTIALLY_FILLED";
        }

        const fill = detectEntryFill(order, candle);

        if (!fill) {
            return false;
        }

        fillEntryOrder({
            order,
            rawPrice: fill.price,
            candle,
            executionIndex,
            fillTiming: fill.timing,
            fillType: fill.fillType,
        });
        return order.status === "FILLED" || order.status === "PARTIALLY_FILLED";
    }

    function processPendingExitOrder(order, candle, executionIndex) {
        const selectedTrades = getTargetTrades(openTrades, order.target);

        if (selectedTrades.length === 0) {
            return false;
        }

        const sides = [...new Set(selectedTrades.map((trade) => trade.side))];

        if (sides.length !== 1) {
            rejectOrder(order, "NON_MARKET_EXIT_REQUIRES_SINGLE_SIDE_TARGET");
            return false;
        }

        const side = sides[0];
        let fill;

        if (order.type === "STOP_LIMIT") {
            if (!order.activated) {
                if (!detectExitStopLimitActivation(order, candle, side)) {
                    return false;
                }

                order.activated = true;
                order.status = "ACTIVATED";
                order.activationTime = candle.time;
                order.activationExecutionIndex = executionIndex;
                return false;
            }

            if (executionIndex <= order.activationExecutionIndex) {
                return false;
            }

            fill = detectExitStopLimitFill(order, candle, side);
        } else {
            fill = detectExitFill(order, candle, side);
        }

        if (!fill) {
            return false;
        }

        const exitPrice = applySlippage({
            price: fill.price,
            side,
            purpose: "EXIT",
            slippagePips: fill.fillType === "STOP"
                ? resolvedExecutionPolicy.slippagePips
                : 0,
            pipSize,
        });
        const closedUnits = closeTargetTrades({
            target: order.target,
            size: order.size,
            price: exitPrice,
            time: candle.time,
            reason: order.reason ?? "STRATEGY_EXIT",
            orderId: order.id,
        });

        order.filledUnits = closedUnits;
        order.status = closedUnits > 0 ? "FILLED" : "CANCELLED";
        order.fillTime = candle.time;
        order.fillPrice = exitPrice;
        return closedUnits > 0;
    }

    function processPendingOrders(candle, executionIndex) {
        expirePendingOrders(candle);

        for (const order of [...pendingOrders]) {
            if (order.status !== "PENDING" && order.status !== "ACTIVATED") {
                continue;
            }

            if (order.action === "ENTER") {
                processPendingEntryOrder(order, candle, executionIndex);
            } else {
                processPendingExitOrder(order, candle, executionIndex);
            }

            if (
                (order.status === "PENDING" || order.status === "ACTIVATED") &&
                (order.timeInForce === "IOC" || order.timeInForce === "FOK") &&
                executionIndex >= order.firstEligibleExecutionIndex
            ) {
                cancelOrder(order, `${order.timeInForce}_UNFILLED`, candle.time);
            }
        }

        removeFinishedPendingOrders();
    }

    function updateOpenTradeMarketState(candle, executionIndex) {
        for (const trade of openTrades) {
            trade.highestPrice = Math.max(trade.highestPrice, candle.mid.high);
            trade.lowestPrice = Math.min(trade.lowestPrice, candle.mid.low);

            if (executionIndex >= trade.entryExecutionIndex) {
                trade.barsHeld++;
            }

            const markPrice = trade.side === "LONG" ? candle.bid.close : candle.ask.close;
            trade.unrealizedPips = Number(calculatePnlPips({
                side: trade.side,
                entryPrice: trade.entryPrice,
                exitPrice: markPrice,
                pipSize,
            }).toFixed(4));
        }
    }

    function evaluateProtectiveExit(trade, candle, executionIndex) {
        if (executionIndex < trade.riskEligibleExecutionIndex) {
            return;
        }

        const prices = getExitPriceSeries(candle, trade.side);
        const stopHit = trade.stopLoss !== null && (
            trade.side === "LONG"
                ? prices.low <= trade.stopLoss
                : prices.high >= trade.stopLoss
        );
        const targetHit = trade.takeProfit !== null && (
            trade.side === "LONG"
                ? prices.high >= trade.takeProfit
                : prices.low <= trade.takeProfit
        );

        if (!stopHit && !targetHit) {
            return;
        }

        let reason;

        if (stopHit && targetHit) {
            reason = resolvedExecutionPolicy.sameCandleConflict === "STOP_FIRST"
                ? "STOP_LOSS"
                : "TAKE_PROFIT";
        } else {
            reason = stopHit ? "STOP_LOSS" : "TAKE_PROFIT";
        }

        const level = reason === "STOP_LOSS" ? trade.stopLoss : trade.takeProfit;
        let rawExitPrice = level;

        if (trade.side === "LONG") {
            if (reason === "STOP_LOSS" && prices.open <= level) rawExitPrice = prices.open;
            if (reason === "TAKE_PROFIT" && prices.open >= level) rawExitPrice = prices.open;
        } else {
            if (reason === "STOP_LOSS" && prices.open >= level) rawExitPrice = prices.open;
            if (reason === "TAKE_PROFIT" && prices.open <= level) rawExitPrice = prices.open;
        }

        const exitPrice = applySlippage({
            price: rawExitPrice,
            side: trade.side,
            purpose: "EXIT",
            slippagePips: reason === "STOP_LOSS" ? resolvedExecutionPolicy.slippagePips : 0,
            pipSize,
        });

        closeTradeUnits({
            trade,
            units: trade.remainingUnits,
            price: exitPrice,
            time: candle.time,
            reason,
            orderId: `protective-${trade.id}-${reason}-${executionIndex}`,
        });
    }

    function evaluateProtectiveExits(candle, executionIndex) {
        for (const trade of [...openTrades]) {
            evaluateProtectiveExit(trade, candle, executionIndex);
        }
    }

    function closeAllAtMarket(candle, point, reason) {
        for (const trade of [...openTrades]) {
            const price = marketExitPrice(trade, candle, point);

            closeTradeUnits({
                trade,
                units: trade.remainingUnits,
                price,
                time: candle.time,
                reason,
                orderId: `${reason.toLowerCase()}-${trade.id}-${candle.time}`,
            });
        }
    }

    function enforceAccountRisk(candle) {
        const snapshot = accountLedger.snapshot({
            openTrades,
            candle,
            point: "close",
            time: candle.time,
        });

        if (
            resolvedAccountConfig.marginCallLevelPercent !== null &&
            snapshot.marginLevelPercent !== null &&
            snapshot.marginLevelPercent <= resolvedAccountConfig.marginCallLevelPercent
        ) {
            riskEvents.push({
                time: candle.time,
                type: "MARGIN_CALL",
                value: snapshot.marginLevelPercent,
                threshold: resolvedAccountConfig.marginCallLevelPercent,
                action: "CLOSE_ALL_AND_HALT",
            });
            closeAllAtMarket(candle, "close", "MARGIN_CALL");
            accountLedger.halt("MARGIN_CALL");
            return;
        }

        const risk = resolvedAccountConfig.risk;
        let breach = null;

        if (
            risk.maxDrawdownPercent !== null &&
            snapshot.currentDrawdownPercent >= risk.maxDrawdownPercent
        ) {
            breach = {
                type: "MAX_DRAWDOWN",
                value: snapshot.currentDrawdownPercent,
                threshold: risk.maxDrawdownPercent,
            };
        } else if (
            risk.maxDailyLossPercent !== null &&
            snapshot.dailyLossPercent >= risk.maxDailyLossPercent
        ) {
            breach = {
                type: "MAX_DAILY_LOSS",
                value: snapshot.dailyLossPercent,
                threshold: risk.maxDailyLossPercent,
            };
        }

        if (!breach || accountLedger.isHalted()) {
            return;
        }

        riskEvents.push({
            time: candle.time,
            ...breach,
            action: risk.breachAction,
        });

        if (risk.breachAction === "CLOSE_ALL_AND_HALT") {
            closeAllAtMarket(candle, "close", breach.type);
        }

        accountLedger.halt(breach.type);
    }

    for (let executionIndex = 0; executionIndex < executionCandles.length; executionIndex++) {
        const executionCandle = executionCandles[executionIndex];
        const intentsForExecution = [];

        while (strategyIndex < strategyCandles.length) {
            const strategyCandle = strategyCandles[strategyIndex];
            const strategyCloseTime = strategyCandle.time + strategyDurationMs;

            if (strategyCloseTime > executionCandle.time) {
                break;
            }

            const accountSnapshot = getAccountSnapshot(executionCandle, "open");
            const context = createStrategyContext({
                candles: strategyCandles,
                index: strategyIndex,
                instrument,
                timeframe: strategyTimeframe,
                account: accountSnapshot,
                position: accountSnapshot.position,
                openTrades: getStrategyTradeSnapshots(executionCandle),
                pendingOrders: pendingOrders.map(orderSnapshot),
            });
            const strategyOutput = strategy.onCandle(context);
            const intents = normalizeTradeIntents(strategyOutput);

            for (const intent of intents) {
                signals.push({
                    time: strategyCandle.time,
                    decisionTime: strategyCloseTime,
                    index: strategyIndex,
                    ...intent,
                });
                intentsForExecution.push({
                    intent,
                    sourceTime: strategyCandle.time,
                    decisionTime: strategyCloseTime,
                });
            }

            strategyIndex++;
        }

        for (const item of intentsForExecution) {
            processIntent(
                item.intent,
                item.sourceTime,
                item.decisionTime,
                executionCandle,
                executionIndex
            );
        }

        processPendingOrders(executionCandle, executionIndex);
        updateOpenTradeMarketState(executionCandle, executionIndex);
        evaluateProtectiveExits(executionCandle, executionIndex);
        enforceAccountRisk(executionCandle);

        if (captureEquityCurve) {
            const snapshot = accountLedger.snapshot({
                openTrades,
                candle: executionCandle,
                point: "close",
                time: executionCandle.time,
            });

            equityCurve.push({
                time: executionCandle.time,
                balance: snapshot.balance,
                equity: snapshot.equity,
                unrealizedPnl: snapshot.unrealizedPnl,
                currentDrawdownPercent: snapshot.currentDrawdownPercent,
                marginUsed: snapshot.marginUsed,
            });
        }
    }

    const lastExecutionCandle = executionCandles.at(-1);

    for (const order of pendingOrders) {
        cancelOrder(order, "END_OF_TEST", lastExecutionCandle.time);
    }
    removeFinishedPendingOrders();

    if (resolvedExecutionPolicy.closeOpenTradesAtEnd && openTrades.length > 0) {
        closeAllAtMarket(lastExecutionCandle, "close", "END_OF_TEST");
    }

    const account = accountLedger.snapshot({
        openTrades,
        candle: lastExecutionCandle,
        point: "close",
        time: lastExecutionCandle.time,
    });

    return {
        processedStrategyCandles: strategyIndex,
        processedExecutionCandles: executionCandles.length,
        accountConfig: {
            ...resolvedAccountConfig,
            quoteToAccountRate,
        },
        executionPolicy: resolvedExecutionPolicy,
        signals,
        orders,
        fills,
        rejectedOrders,
        trades,
        openTrades: openTrades.map(tradeSnapshot),
        pendingOrders: pendingOrders.map(orderSnapshot),
        account,
        riskEvents,
        equityCurve,
    };
}
