import {
    validateEntrySize,
    validateExitSize,
} from "../account/position-sizing.js";

const ACTIONS = new Set([
    "ENTER",
    "EXIT",
    "UPDATE_STOP",
    "UPDATE_TARGET",
    "CANCEL_ORDER",
]);

const SIDES = new Set(["LONG", "SHORT"]);

const ORDER_TYPES = new Set([
    "MARKET",
    "LIMIT",
    "STOP",
    "STOP_LIMIT",
]);

const TIME_IN_FORCE = new Set([
    "GTC",
    "DAY",
    "IOC",
    "FOK",
]);

const LEVEL_TYPES = new Set([
    "PIPS",
    "PRICE",
    "PERCENT",
]);

const TARGET_TYPES = new Set([
    "ALL",
    "TRADE_ID",
    "ENTRY_ID",
    "SIDE",
]);

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateOptionalString(value, name) {
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
        throw new Error(`${name} must be a non-empty string`);
    }
}

function validateLevel(level, name, { allowNull = false } = {}) {
    if (allowNull && level === null) {
        return;
    }

    if (!isPlainObject(level)) {
        throw new Error(`${name} must be an object`);
    }

    if (!LEVEL_TYPES.has(level.type)) {
        throw new Error(`${name}.type must be PIPS, PRICE or PERCENT`);
    }

    if (!Number.isFinite(level.value) || level.value <= 0) {
        throw new Error(`${name}.value must be a positive number`);
    }

    if (level.type === "PERCENT" && level.value > 100) {
        throw new Error(`${name}.value cannot exceed 100 percent`);
    }
}

function validateOrder(order, name = "order") {
    if (order === undefined) {
        return;
    }

    if (!isPlainObject(order)) {
        throw new Error(`${name} must be an object`);
    }

    if (!ORDER_TYPES.has(order.type)) {
        throw new Error(`${name}.type must be MARKET, LIMIT, STOP or STOP_LIMIT`);
    }

    if (order.timeInForce !== undefined && !TIME_IN_FORCE.has(order.timeInForce)) {
        throw new Error(`${name}.timeInForce must be GTC, DAY, IOC or FOK`);
    }

    if (order.expiresAt !== undefined && !Number.isFinite(order.expiresAt)) {
        throw new Error(`${name}.expiresAt must be an epoch millisecond timestamp`);
    }

    if (order.type === "LIMIT" || order.type === "STOP_LIMIT") {
        if (!Number.isFinite(order.limitPrice) || order.limitPrice <= 0) {
            throw new Error(`${name}.limitPrice must be a positive number`);
        }
    }

    if (order.type === "STOP" || order.type === "STOP_LIMIT") {
        if (!Number.isFinite(order.stopPrice) || order.stopPrice <= 0) {
            throw new Error(`${name}.stopPrice must be a positive number`);
        }
    }
}

function validateTarget(target, name = "target") {
    if (target === undefined) {
        return;
    }

    if (!isPlainObject(target)) {
        throw new Error(`${name} must be an object`);
    }

    if (!TARGET_TYPES.has(target.type)) {
        throw new Error(`${name}.type must be ALL, TRADE_ID, ENTRY_ID or SIDE`);
    }

    if (target.type === "ALL") {
        return;
    }

    if (target.type === "SIDE") {
        if (!SIDES.has(target.value)) {
            throw new Error(`${name}.value must be LONG or SHORT for a SIDE target`);
        }

        return;
    }

    if (typeof target.value !== "string" || !target.value.trim()) {
        throw new Error(`${name}.value must be a non-empty string`);
    }
}

function validateMetadata(metadata) {
    if (metadata !== undefined && !isPlainObject(metadata)) {
        throw new Error("metadata must be an object");
    }
}

function validateEnterIntent(intent) {
    if (!SIDES.has(intent.side)) {
        throw new Error("Trade side must be LONG or SHORT");
    }

    validateOptionalString(intent.entryId, "entryId");
    validateOrder(intent.order);

    if (intent.size !== undefined) {
        validateEntrySize(intent.size);
    }

    if (intent.stopLoss !== undefined) {
        validateLevel(intent.stopLoss, "stopLoss");
    }

    if (intent.takeProfit !== undefined) {
        validateLevel(intent.takeProfit, "takeProfit");
    }
}

function validateExitIntent(intent) {
    validateTarget(intent.target);
    validateOrder(intent.order);
    validateOptionalString(intent.reason, "reason");

    if (intent.size !== undefined) {
        validateExitSize(intent.size);
    }
}

function validateUpdateIntent(intent, fieldName) {
    validateTarget(intent.target);

    if (!Object.hasOwn(intent, fieldName)) {
        throw new Error(`${fieldName} is required`);
    }

    validateLevel(intent[fieldName], fieldName, { allowNull: true });
}

function validateCancelIntent(intent) {
    const hasOrderId = typeof intent.orderId === "string" && intent.orderId.trim();
    const cancelAll = intent.all === true;

    if (!hasOrderId && !cancelAll) {
        throw new Error("CANCEL_ORDER requires orderId or all: true");
    }
}

export function validateTradeIntent(intent) {
    if (!isPlainObject(intent)) {
        throw new Error("Trade intent must be an object");
    }

    if (!ACTIONS.has(intent.action)) {
        throw new Error(`Unsupported trade action: ${intent.action}`);
    }

    validateOptionalString(intent.id, "id");
    validateMetadata(intent.metadata);

    if (intent.action === "ENTER") {
        validateEnterIntent(intent);
    } else if (intent.action === "EXIT") {
        validateExitIntent(intent);
    } else if (intent.action === "UPDATE_STOP") {
        validateUpdateIntent(intent, "stopLoss");
    } else if (intent.action === "UPDATE_TARGET") {
        validateUpdateIntent(intent, "takeProfit");
    } else if (intent.action === "CANCEL_ORDER") {
        validateCancelIntent(intent);
    }

    return intent;
}

export function normalizeTradeIntents(value) {
    if (value === null || value === undefined) {
        return [];
    }

    const intents = Array.isArray(value) ? value : [value];

    for (const intent of intents) {
        validateTradeIntent(intent);
    }

    return intents;
}