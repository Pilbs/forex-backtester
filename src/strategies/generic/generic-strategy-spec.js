function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isParameterReference(value) {
    return (
        isPlainObject(value)
        && Object.keys(value).length === 1
        && typeof value.parameter === "string"
        && value.parameter.trim().length > 0
    );
}

function requirePositiveIntegerOrReference(value, name) {
    if (isParameterReference(value)) return;

    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer or parameter reference`);
    }
}

function requireFiniteNumberOrReference(value, name) {
    if (isParameterReference(value)) return;

    if (!Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number or parameter reference`);
    }
}

function validateConditionTemplate(condition) {
    if (!isPlainObject(condition)) {
        throw new Error("condition must be an object");
    }

    switch (condition.type) {
        case "RSI_THRESHOLD":
            requirePositiveIntegerOrReference(condition.period ?? 14, "RSI period");
            requireFiniteNumberOrReference(condition.value, "RSI threshold");

            if (!new Set(["BELOW", "ABOVE"]).has(condition.operator)) {
                throw new Error("RSI_THRESHOLD operator must be BELOW or ABOVE");
            }
            break;

        case "EMA_CROSS":
            requirePositiveIntegerOrReference(condition.fastPeriod, "EMA fastPeriod");
            requirePositiveIntegerOrReference(condition.slowPeriod, "EMA slowPeriod");

            if (
                !isParameterReference(condition.fastPeriod)
                && !isParameterReference(condition.slowPeriod)
                && condition.fastPeriod >= condition.slowPeriod
            ) {
                throw new Error("EMA_CROSS fastPeriod must be less than slowPeriod");
            }

            if (!new Set(["ABOVE", "BELOW"]).has(condition.direction)) {
                throw new Error("EMA_CROSS direction must be ABOVE or BELOW");
            }
            break;

        default:
            throw new Error(`Unsupported generic condition type: ${condition.type}`);
    }
}

function validateConditionGroupTemplate(group, name) {
    if (!isPlainObject(group)) {
        throw new Error(`${name} must be an object`);
    }

    const logic = group.logic ?? "AND";

    if (!new Set(["AND", "OR"]).has(logic)) {
        throw new Error(`${name} logic must be AND or OR`);
    }

    if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
        throw new Error(`${name} must contain at least one condition`);
    }

    for (const condition of group.conditions) {
        validateConditionTemplate(condition);
    }
}

function validateRiskTemplate(risk, name) {
    if (risk === undefined) return;

    if (!isPlainObject(risk)) {
        throw new Error(`${name} must be an object`);
    }

    if (risk.stopLossPips !== undefined) {
        requireFiniteNumberOrReference(risk.stopLossPips, `${name} stop loss pips`);
    }

    if (risk.takeProfitPips !== undefined) {
        requireFiniteNumberOrReference(risk.takeProfitPips, `${name} take profit pips`);
    }
}

function validatePositionTemplate(position, sideName) {
    if (!isPlainObject(position)) {
        throw new Error(`${sideName} position rules must be an object`);
    }

    if (!position.entry) {
        throw new Error(`${sideName} entry rules are required`);
    }

    validateConditionGroupTemplate(position.entry, `${sideName} entry`);

    if (position.exit !== undefined) {
        validateConditionGroupTemplate(position.exit, `${sideName} exit`);
    }

    validateRiskTemplate(position.risk, `${sideName} risk`);
}

function collectParameterReferences(value, references = new Set()) {
    if (isParameterReference(value)) {
        references.add(value.parameter);
        return references;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectParameterReferences(item, references);
        return references;
    }

    if (isPlainObject(value)) {
        for (const nested of Object.values(value)) {
            collectParameterReferences(nested, references);
        }
    }

    return references;
}

function resolveValue(value, strategyConfig) {
    if (isParameterReference(value)) {
        const parameterName = value.parameter;

        if (!Object.hasOwn(strategyConfig, parameterName)) {
            throw new Error(
                `Generic strategy parameter ${parameterName} has no resolved value`
            );
        }

        return strategyConfig[parameterName];
    }

    if (Array.isArray(value)) {
        return value.map((item) => resolveValue(item, strategyConfig));
    }

    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [
                key,
                resolveValue(nested, strategyConfig),
            ])
        );
    }

    return value;
}

export function normalizeGenericStrategySpecShape(strategySpec) {
    if (!isPlainObject(strategySpec)) {
        throw new Error("generic strategy specification must be an object");
    }

    if (strategySpec.version === 2) {
        return strategySpec;
    }

    if (strategySpec.version === 1) {
        const side = strategySpec.side ?? "LONG";

        if (!new Set(["LONG", "SHORT"]).has(side)) {
            throw new Error("generic strategy side must be LONG or SHORT");
        }

        return {
            ...strategySpec,
            version: 2,
            positions: {
                [side.toLowerCase()]: {
                    entry: strategySpec.entry,
                    exit: strategySpec.exit,
                    risk: strategySpec.risk,
                },
            },
            side: undefined,
            entry: undefined,
            exit: undefined,
            risk: undefined,
        };
    }

    throw new Error("generic strategy definition version must be 1 or 2");
}

export function validateGenericStrategySpecTemplate(strategySpec) {
    const normalized = normalizeGenericStrategySpecShape(strategySpec);

    if (!isPlainObject(normalized.positions)) {
        throw new Error("generic strategy positions must be an object");
    }

    const long = normalized.positions.long;
    const short = normalized.positions.short;

    if (!long && !short) {
        throw new Error("generic strategy must define long rules, short rules, or both");
    }

    if (long) validatePositionTemplate(long, "long");
    if (short) validatePositionTemplate(short, "short");

    if (normalized.builderMode !== undefined && !new Set([
        "LONG_ONLY",
        "SHORT_ONLY",
        "BOTH_MIRRORED",
        "BOTH_INDEPENDENT",
    ]).has(normalized.builderMode)) {
        throw new Error("generic strategy builderMode is invalid");
    }

    return strategySpec;
}

export function getGenericStrategyParameters(strategySpec) {
    validateGenericStrategySpecTemplate(strategySpec);
    const normalized = normalizeGenericStrategySpecShape(strategySpec);
    const parameters = normalized.parameters ?? {};

    if (!isPlainObject(parameters)) {
        throw new Error("generic strategy parameters must be an object");
    }

    const references = collectParameterReferences(normalized.positions);

    for (const parameterName of references) {
        if (!Object.hasOwn(parameters, parameterName)) {
            throw new Error(
                `Generic strategy references undeclared parameter: ${parameterName}`
            );
        }
    }

    for (const parameterName of Object.keys(parameters)) {
        if (!references.has(parameterName)) {
            throw new Error(
                `Generic strategy parameter is declared but not used: ${parameterName}`
            );
        }
    }

    return { ...parameters };
}

export function resolveGenericStrategySpec(strategySpec, strategyConfig = {}) {
    getGenericStrategyParameters(strategySpec);
    const normalized = normalizeGenericStrategySpecShape(strategySpec);

    const {
        parameters,
        ...runtimeSpec
    } = normalized;

    return resolveValue(runtimeSpec, strategyConfig);
}
