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

export function getGenericStrategyParameters(strategySpec) {
    if (!isPlainObject(strategySpec)) {
        throw new Error("generic strategy specification must be an object");
    }

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
