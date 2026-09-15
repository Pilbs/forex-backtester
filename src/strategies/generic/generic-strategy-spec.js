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
    if (isParameterReference(value)) {
        return;
    }

    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer or parameter reference`);
    }
}

function requireFiniteNumberOrReference(value, name) {
    if (isParameterReference(value)) {
        return;
    }

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
            requirePositiveIntegerOrReference(
                condition.period ?? 14,
                "RSI period"
            );
            requireFiniteNumberOrReference(
                condition.value,
                "RSI threshold"
            );

            if (!new Set(["BELOW", "ABOVE"]).has(condition.operator)) {
                throw new Error("RSI_THRESHOLD operator must be BELOW or ABOVE");
            }
            break;

        case "EMA_CROSS":
            requirePositiveIntegerOrReference(
                condition.fastPeriod,
                "EMA fastPeriod"
            );
            requirePositiveIntegerOrReference(
                condition.slowPeriod,
                "EMA slowPeriod"
            );

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
            throw new Error(
                `Unsupported generic condition type: ${condition.type}`
            );
    }
}

function validateConditionGroupTemplate(group) {
    if (!isPlainObject(group)) {
        throw new Error("condition group must be an object");
    }

    const logic = group.logic ?? "AND";

    if (!new Set(["AND", "OR"]).has(logic)) {
        throw new Error("condition group logic must be AND or OR");
    }

    if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
        throw new Error("condition group must contain at least one condition");
    }

    for (const condition of group.conditions) {
        validateConditionTemplate(condition);
    }
}

function collectParameterReferences(value, references = new Set()) {
    if (isParameterReference(value)) {
        references.add(value.parameter);
        return references;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectParameterReferences(item, references);
        }

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

export function validateGenericStrategySpecTemplate(strategySpec) {
    if (!isPlainObject(strategySpec)) {
        throw new Error("generic strategy specification must be an object");
    }

    if (strategySpec.version !== 1) {
        throw new Error("generic strategy definition version must be 1");
    }

    const side = strategySpec.side ?? "LONG";

    if (!new Set(["LONG", "SHORT"]).has(side)) {
        throw new Error("generic strategy side must be LONG or SHORT");
    }

    if (!strategySpec.entry) {
        throw new Error("generic strategy definition entry is required");
    }

    validateConditionGroupTemplate(strategySpec.entry);

    if (strategySpec.exit !== undefined) {
        validateConditionGroupTemplate(strategySpec.exit);
    }

    return strategySpec;
}

export function getGenericStrategyParameters(strategySpec) {
    validateGenericStrategySpecTemplate(strategySpec);

    const parameters = strategySpec.parameters ?? {};

    if (!isPlainObject(parameters)) {
        throw new Error("generic strategy parameters must be an object");
    }

    const references = collectParameterReferences({
        side: strategySpec.side,
        entry: strategySpec.entry,
        exit: strategySpec.exit,
    });

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

    const {
        parameters,
        ...runtimeSpec
    } = strategySpec;

    return resolveValue(runtimeSpec, strategyConfig);
}
