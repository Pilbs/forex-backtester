export async function runParameterSweep({
    strategyFactory,
    baseStrategyConfig,
    parameterName,
    values,
    executeRun,
}) {
    if (typeof strategyFactory !== "function") { throw new Error("strategyFactory must be a function"); }
    if (!baseStrategyConfig || typeof baseStrategyConfig !== "object") { throw new Error("baseStrategyConfig must be an object");    }
    if (!parameterName) { throw new Error("parameterName is required"); }
    if (!Array.isArray(values) || values.length === 0) { throw new Error("values must be a non-empty array");}
    if (typeof executeRun !== "function") { throw new Error("executeRun must be a function");}
    
    const results = [];
    
    for (const value of values) {
        const strategyConfig = {
            ...baseStrategyConfig,
            [parameterName]: value,
        };
        const strategy = strategyFactory(strategyConfig);
        const result = await executeRun({
            strategy,
            strategyConfig,
        });
        results.push({
            parameterName,
            parameterValue: value,
            strategyConfig,
            result,
        });
    }
    return results;
}