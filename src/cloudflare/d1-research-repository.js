const EXPERIMENT_PURPOSES = new Set([
    "RESEARCH",
    "BENCHMARK",
    "DETAILED_RERUN",
]);

const EXPERIMENT_STATUSES = new Set([
    "PLANNED",
    "QUEUED",
    "RUNNING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
]);

function requiredText(value, name) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${name} must be a non-empty string`);
    }

    return value.trim();
}

function optionalText(value, name) {
    if (value === undefined || value === null) {
        return null;
    }

    return requiredText(value, name);
}

function json(value, name) {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        throw new Error(`${name} must be JSON-serializable`);
    }
}

function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
}

function integerOrZero(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

function integerOrNull(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function createIdentifier(prefix, createId) {
    return `${prefix}-${createId()}`;
}

async function first(statement) {
    return statement.first();
}

async function runBatch(db, statements) {
    if (statements.length === 0) {
        return [];
    }

    if (typeof db.batch === "function") {
        return db.batch(statements);
    }

    return Promise.all(statements.map((statement) => statement.run()));
}

export function createD1ResearchRepository({
    db,
    now = () => Date.now(),
    createId = () => crypto.randomUUID(),
} = {}) {
    if (!db?.prepare) {
        throw new Error("Research D1 database binding is required");
    }

    async function getUser(userId) {
        return first(db.prepare(`
            SELECT id, email, display_name, status, created_at, updated_at
            FROM users
            WHERE id = ?
        `).bind(userId));
    }

    async function ensureUser(identity) {
        const provider = requiredText(identity?.provider, "identity.provider");
        const subject = requiredText(identity?.subject, "identity.subject");
        const email = requiredText(identity?.email, "identity.email").toLowerCase();
        const displayName = optionalText(identity?.displayName, "identity.displayName") ?? email;
        const timestamp = now();

        const linkedUser = await first(db.prepare(`
            SELECT u.id
            FROM user_identities i
            JOIN users u ON u.id = i.user_id
            WHERE i.auth_provider = ? AND i.auth_subject = ?
        `).bind(provider, subject));

        if (linkedUser) {
            await runBatch(db, [
                db.prepare(`
                    UPDATE users
                    SET email = ?, display_name = ?, updated_at = ?
                    WHERE id = ?
                `).bind(email, displayName, timestamp, linkedUser.id),
                db.prepare(`
                    UPDATE user_identities
                    SET email_at_link = ?, last_seen_at = ?
                    WHERE auth_provider = ? AND auth_subject = ?
                `).bind(email, timestamp, provider, subject),
            ]);

            return getUser(linkedUser.id);
        }

        const emailUser = await first(db.prepare(`
            SELECT id FROM users WHERE email = ? COLLATE NOCASE
        `).bind(email));
        const userId = emailUser?.id ?? createIdentifier("user", createId);

        if (!emailUser) {
            await db.prepare(`
                INSERT INTO users (
                    id, email, display_name, status, created_at, updated_at
                ) VALUES (?, ?, ?, 'ACTIVE', ?, ?)
            `).bind(
                userId,
                email,
                displayName,
                timestamp,
                timestamp
            ).run();
        }

        await db.prepare(`
            INSERT INTO user_identities (
                auth_provider,
                auth_subject,
                user_id,
                email_at_link,
                created_at,
                last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
            provider,
            subject,
            userId,
            email,
            timestamp,
            timestamp
        ).run();

        return getUser(userId);
    }

    async function ensurePersonalWorkspace(user) {
        const userId = requiredText(user?.id, "user.id");
        const existing = await first(db.prepare(`
            SELECT w.id, w.name, w.kind, wm.role
            FROM workspaces w
            JOIN workspace_members wm ON wm.workspace_id = w.id
            WHERE wm.user_id = ? AND w.kind = 'PERSONAL'
            ORDER BY w.created_at ASC
            LIMIT 1
        `).bind(userId));

        if (existing) {
            return existing;
        }

        const workspaceId = createIdentifier("workspace", createId);
        const timestamp = now();
        const ownerName = user.display_name ?? user.email ?? "Personal";

        await runBatch(db, [
            db.prepare(`
                INSERT INTO workspaces (
                    id, name, kind, owner_user_id, created_at, updated_at
                ) VALUES (?, ?, 'PERSONAL', ?, ?, ?)
            `).bind(
                workspaceId,
                `${ownerName}'s workspace`,
                userId,
                timestamp,
                timestamp
            ),
            db.prepare(`
                INSERT INTO workspace_members (
                    workspace_id, user_id, role, created_at
                ) VALUES (?, ?, 'OWNER', ?)
            `).bind(workspaceId, userId, timestamp),
        ]);

        return {
            id: workspaceId,
            name: `${ownerName}'s workspace`,
            kind: "PERSONAL",
            role: "OWNER",
        };
    }

    async function resolveUserContext(identity) {
        const user = await ensureUser(identity);
        const workspace = await ensurePersonalWorkspace(user);

        return { user, workspace };
    }

    async function assertWorkspaceMember(workspaceId, userId) {
        const membership = await first(db.prepare(`
            SELECT role
            FROM workspace_members
            WHERE workspace_id = ? AND user_id = ?
        `).bind(workspaceId, userId));

        if (!membership) {
            throw new Error("User is not a member of the requested workspace");
        }

        return membership;
    }

    async function createExperiment({
        id,
        workspaceId,
        createdByUserId,
        parentExperimentId,
        sourceRunId,
        purpose = "RESEARCH",
        name,
        strategy,
        market,
        config,
        requestedRuns = 0,
        validRuns = 0,
        resultSchemaVersion,
        applicationVersion,
    }) {
        const normalizedWorkspaceId = requiredText(workspaceId, "workspaceId");
        const normalizedUserId = requiredText(createdByUserId, "createdByUserId");

        await assertWorkspaceMember(normalizedWorkspaceId, normalizedUserId);

        if (!EXPERIMENT_PURPOSES.has(purpose)) {
            throw new Error(`Unsupported experiment purpose: ${purpose}`);
        }

        const experimentId = optionalText(id, "id") ?? createIdentifier("experiment", createId);
        const timestamp = now();

        await db.prepare(`
            INSERT INTO experiments (
                id,
                workspace_id,
                created_by_user_id,
                parent_experiment_id,
                source_run_id,
                purpose,
                status,
                name,
                strategy_id,
                strategy_name,
                strategy_version,
                result_schema_version,
                application_version,
                instrument,
                strategy_timeframe,
                execution_timeframe,
                from_time,
                to_time,
                config_json,
                requested_runs,
                valid_runs,
                created_at,
                updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `).bind(
            experimentId,
            normalizedWorkspaceId,
            normalizedUserId,
            parentExperimentId ?? null,
            sourceRunId ?? null,
            purpose,
            name ?? null,
            requiredText(strategy?.id, "strategy.id"),
            requiredText(strategy?.name, "strategy.name"),
            Number.isInteger(strategy?.version) ? strategy.version : null,
            Number.isInteger(resultSchemaVersion) ? resultSchemaVersion : null,
            applicationVersion ?? null,
            requiredText(market?.instrument, "market.instrument"),
            requiredText(market?.strategyTimeframe, "market.strategyTimeframe"),
            requiredText(market?.executionTimeframe, "market.executionTimeframe"),
            requiredText(market?.from, "market.from"),
            requiredText(market?.to, "market.to"),
            json(config, "config"),
            integerOrZero(requestedRuns),
            integerOrZero(validRuns),
            timestamp,
            timestamp
        ).run();

        return getExperiment({
            workspaceId: normalizedWorkspaceId,
            experimentId,
        });
    }

    async function getExperiment({ workspaceId, experimentId }) {
        return first(db.prepare(`
            SELECT *
            FROM experiments
            WHERE workspace_id = ? AND id = ?
        `).bind(workspaceId, experimentId));
    }

    async function listExperiments({ workspaceId, limit = 50, offset = 0 }) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
            throw new Error("limit must be an integer between 1 and 200");
        }

        if (!Number.isInteger(offset) || offset < 0) {
            throw new Error("offset must be a non-negative integer");
        }

        const result = await db.prepare(`
            SELECT *
            FROM experiments
            WHERE workspace_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).bind(workspaceId, limit, offset).all();

        return result?.results ?? [];
    }

    async function updateExperimentStatus({
        workspaceId,
        experimentId,
        status,
        totals = {},
        execution = {},
        error,
    }) {
        if (!EXPERIMENT_STATUSES.has(status)) {
            throw new Error(`Unsupported experiment status: ${status}`);
        }

        const timestamp = now();
        const startedAt = status === "RUNNING" ? timestamp : null;
        const completedAt = ["COMPLETED", "FAILED", "CANCELLED"].includes(status)
            ? timestamp
            : null;

        await db.prepare(`
            UPDATE experiments
            SET status = ?,
                completed_runs = COALESCE(?, completed_runs),
                failed_runs = COALESCE(?, failed_runs),
                dataset_rows = COALESCE(?, dataset_rows),
                candle_evaluations = COALESCE(?, candle_evaluations),
                wall_time_ms = COALESCE(?, wall_time_ms),
                d1_query_count = COALESCE(?, d1_query_count),
                d1_rows_read = COALESCE(?, d1_rows_read),
                d1_duration_ms = COALESCE(?, d1_duration_ms),
                error_json = COALESCE(?, error_json),
                started_at = COALESCE(started_at, ?),
                completed_at = COALESCE(?, completed_at),
                updated_at = ?
            WHERE workspace_id = ? AND id = ?
        `).bind(
            status,
            integerOrNull(totals.completedRuns),
            integerOrNull(totals.failedRuns),
            finiteOrNull(execution.datasetRows),
            finiteOrNull(execution.candleEvaluations),
            finiteOrNull(execution.wallTimeMs),
            finiteOrNull(execution.d1QueryCount),
            finiteOrNull(execution.d1RowsRead),
            finiteOrNull(execution.d1DurationMs),
            error === undefined ? null : json(error, "error"),
            startedAt,
            completedAt,
            timestamp,
            workspaceId,
            experimentId
        ).run();

        return getExperiment({ workspaceId, experimentId });
    }

    async function saveExperimentRun({ experimentId, run }) {
        const runNumber = run?.runNumber;

        if (!Number.isInteger(runNumber) || runNumber < 1) {
            throw new Error("run.runNumber must be a positive integer");
        }

        const runId = optionalText(run.runId, "run.runId")
            ?? `${experimentId}-run-${runNumber}`;
        const summary = run.summary ?? {};
        const timestamp = now();

        await db.prepare(`
            INSERT INTO experiment_runs (
                id,
                experiment_id,
                run_number,
                status,
                parameter_values_json,
                strategy_config_json,
                summary_json,
                detail_counts_json,
                rejection_reasons_json,
                total_trades,
                wins,
                losses,
                breakeven,
                win_rate,
                total_pnl_pips,
                net_pnl_account,
                return_percent,
                profit_factor,
                max_drawdown_percent,
                expectancy_pips,
                average_holding_minutes,
                average_mfe_pips,
                average_mae_pips,
                elapsed_ms,
                error_json,
                has_trade_details,
                created_at,
                updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(experiment_id, run_number) DO UPDATE SET
                status = excluded.status,
                parameter_values_json = excluded.parameter_values_json,
                strategy_config_json = excluded.strategy_config_json,
                summary_json = excluded.summary_json,
                detail_counts_json = excluded.detail_counts_json,
                rejection_reasons_json = excluded.rejection_reasons_json,
                total_trades = excluded.total_trades,
                wins = excluded.wins,
                losses = excluded.losses,
                breakeven = excluded.breakeven,
                win_rate = excluded.win_rate,
                total_pnl_pips = excluded.total_pnl_pips,
                net_pnl_account = excluded.net_pnl_account,
                return_percent = excluded.return_percent,
                profit_factor = excluded.profit_factor,
                max_drawdown_percent = excluded.max_drawdown_percent,
                expectancy_pips = excluded.expectancy_pips,
                average_holding_minutes = excluded.average_holding_minutes,
                average_mfe_pips = excluded.average_mfe_pips,
                average_mae_pips = excluded.average_mae_pips,
                elapsed_ms = excluded.elapsed_ms,
                error_json = excluded.error_json,
                has_trade_details = MAX(
                    experiment_runs.has_trade_details,
                    excluded.has_trade_details
                ),
                updated_at = excluded.updated_at
        `).bind(
            runId,
            experimentId,
            runNumber,
            run.status ?? "PLANNED",
            json(run.parameterValues ?? {}, "run.parameterValues"),
            json(run.strategyConfig ?? {}, "run.strategyConfig"),
            run.summary ? json(run.summary, "run.summary") : null,
            run.detailCounts ? json(run.detailCounts, "run.detailCounts") : null,
            run.rejectionReasons ? json(run.rejectionReasons, "run.rejectionReasons") : null,
            finiteOrNull(summary.totalTrades),
            finiteOrNull(summary.wins),
            finiteOrNull(summary.losses),
            finiteOrNull(summary.breakeven),
            finiteOrNull(summary.winRate),
            finiteOrNull(summary.totalPnlPips),
            finiteOrNull(summary.netPnlAccount),
            finiteOrNull(summary.returnPercent),
            finiteOrNull(summary.profitFactor),
            finiteOrNull(summary.maxDrawdownPercent),
            finiteOrNull(summary.expectancyPips),
            finiteOrNull(summary.averageHoldingMinutes),
            finiteOrNull(summary.averageMfePips),
            finiteOrNull(summary.averageMaePips),
            finiteOrNull(run.elapsedMs),
            run.error ? json(run.error, "run.error") : null,
            Array.isArray(run.trades) ? 1 : 0,
            timestamp,
            timestamp
        ).run();

        return first(db.prepare(`
            SELECT * FROM experiment_runs
            WHERE experiment_id = ? AND run_number = ?
        `).bind(experimentId, runNumber));
    }

    async function replaceRunPeriodSummaries({ runId, yearly = [], monthly = [] }) {
        const periods = [
            ...yearly.map((summary) => ({
                type: "YEAR",
                key: String(summary.year),
                summary,
            })),
            ...monthly.map((summary) => ({
                type: "MONTH",
                key: String(summary.month),
                summary,
            })),
        ];

        const statements = [db.prepare(`
            DELETE FROM run_period_summaries WHERE run_id = ?
        `).bind(runId), ...periods.map(({ type, key, summary }) => db.prepare(`
            INSERT INTO run_period_summaries (
                run_id,
                period_type,
                period_key,
                summary_json,
                total_trades,
                win_rate,
                total_pnl_pips,
                net_pnl_account,
                return_percent,
                profit_factor,
                max_drawdown_percent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            runId,
            type,
            key,
            json(summary, "period summary"),
            finiteOrNull(summary.totalTrades),
            finiteOrNull(summary.winRate),
            finiteOrNull(summary.totalPnlPips),
            finiteOrNull(summary.netPnlAccount),
            finiteOrNull(summary.returnPercent),
            finiteOrNull(summary.profitFactor),
            finiteOrNull(summary.maxDrawdownPercent)
        ))];

        await runBatch(db, statements);
        return periods.length;
    }

    async function saveRunTrades({ runId, trades }) {
        if (!Array.isArray(trades)) {
            throw new Error("trades must be an array");
        }

        const timestamp = now();
        const statements = [
            db.prepare(`DELETE FROM run_trades WHERE run_id = ?`).bind(runId),
            ...trades.map((trade, index) => db.prepare(`
            INSERT INTO run_trades (
                id,
                run_id,
                trade_number,
                side,
                result,
                entry_time,
                exit_time,
                entry_price,
                exit_price,
                units,
                pnl_pips,
                pnl_account,
                commission_account,
                mfe_pips,
                mae_pips,
                holding_minutes,
                entry_reason,
                exit_reason,
                trade_json,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            trade.id ?? `${runId}-trade-${index + 1}`,
            runId,
            index + 1,
            trade.side ?? null,
            trade.result ?? null,
            finiteOrNull(trade.entryTime),
            finiteOrNull(trade.exitTime),
            finiteOrNull(trade.entryPrice),
            finiteOrNull(trade.exitPrice),
            finiteOrNull(trade.units ?? trade.initialUnits),
            finiteOrNull(trade.pnlPips),
            finiteOrNull(trade.pnlAccount),
            finiteOrNull(trade.commissionAccount),
            finiteOrNull(trade.mfePips),
            finiteOrNull(trade.maePips),
            finiteOrNull(trade.holdingMinutes),
            trade.entryReason ?? null,
            trade.exitReason ?? null,
            json(trade, "trade"),
            timestamp
            )),
            db.prepare(`
                UPDATE experiment_runs
                SET has_trade_details = 1, updated_at = ?
                WHERE id = ?
            `).bind(timestamp, runId),
        ];

        await runBatch(db, statements);

        return trades.length;
    }

    async function createExperimentBatch({
        id,
        experimentId,
        batchNumber,
        firstRunNumber,
        lastRunNumber,
        attempt = 1,
        workerRequestId,
        status = "QUEUED",
    }) {
        if (!Number.isInteger(batchNumber) || batchNumber < 1) {
            throw new Error("batchNumber must be a positive integer");
        }

        if (!Number.isInteger(firstRunNumber) || firstRunNumber < 1) {
            throw new Error("firstRunNumber must be a positive integer");
        }

        if (!Number.isInteger(lastRunNumber) || lastRunNumber < firstRunNumber) {
            throw new Error("lastRunNumber must be at least firstRunNumber");
        }

        if (!Number.isInteger(attempt) || attempt < 1) {
            throw new Error("attempt must be a positive integer");
        }

        if (!EXPERIMENT_STATUSES.has(status) || status === "PLANNED") {
            throw new Error(`Unsupported batch status: ${status}`);
        }

        const batchId = optionalText(id, "id") ?? createIdentifier("batch", createId);
        const timestamp = now();

        await db.prepare(`
            INSERT INTO experiment_batches (
                id,
                experiment_id,
                batch_number,
                first_run_number,
                last_run_number,
                status,
                attempt,
                worker_request_id,
                created_at,
                started_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            batchId,
            experimentId,
            batchNumber,
            firstRunNumber,
            lastRunNumber,
            status,
            attempt,
            workerRequestId ?? null,
            timestamp,
            status === "RUNNING" ? timestamp : null,
            timestamp
        ).run();

        return first(db.prepare(`
            SELECT * FROM experiment_batches WHERE id = ?
        `).bind(batchId));
    }

    async function updateExperimentBatch({
        batchId,
        status,
        workerRequestId,
        execution = {},
        error,
    }) {
        if (!EXPERIMENT_STATUSES.has(status) || status === "PLANNED") {
            throw new Error(`Unsupported batch status: ${status}`);
        }

        const timestamp = now();
        const completedAt = ["COMPLETED", "FAILED", "CANCELLED"].includes(status)
            ? timestamp
            : null;

        await db.prepare(`
            UPDATE experiment_batches
            SET status = ?,
                worker_request_id = COALESCE(?, worker_request_id),
                wall_time_ms = COALESCE(?, wall_time_ms),
                cpu_time_ms = COALESCE(?, cpu_time_ms),
                d1_query_count = COALESCE(?, d1_query_count),
                d1_rows_read = COALESCE(?, d1_rows_read),
                d1_duration_ms = COALESCE(?, d1_duration_ms),
                error_json = COALESCE(?, error_json),
                started_at = COALESCE(started_at, ?),
                completed_at = COALESCE(?, completed_at),
                updated_at = ?
            WHERE id = ?
        `).bind(
            status,
            workerRequestId ?? null,
            finiteOrNull(execution.wallTimeMs),
            finiteOrNull(execution.cpuTimeMs),
            finiteOrNull(execution.d1QueryCount),
            finiteOrNull(execution.d1RowsRead),
            finiteOrNull(execution.d1DurationMs),
            error === undefined ? null : json(error, "error"),
            status === "RUNNING" ? timestamp : null,
            completedAt,
            timestamp,
            batchId
        ).run();

        return first(db.prepare(`
            SELECT * FROM experiment_batches WHERE id = ?
        `).bind(batchId));
    }

    return {
        ensureUser,
        ensurePersonalWorkspace,
        resolveUserContext,
        assertWorkspaceMember,
        createExperiment,
        getExperiment,
        listExperiments,
        updateExperimentStatus,
        saveExperimentRun,
        replaceRunPeriodSummaries,
        saveRunTrades,
        createExperimentBatch,
        updateExperimentBatch,
    };
}
