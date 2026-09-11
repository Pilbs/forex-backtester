PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'DISABLED')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_identities (
    auth_provider TEXT NOT NULL,
    auth_subject TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email_at_link TEXT NOT NULL COLLATE NOCASE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    PRIMARY KEY (auth_provider, auth_subject),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user
    ON user_identities(user_id);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'PERSONAL'
        CHECK (kind IN ('PERSONAL', 'TEAM')),
    owner_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner
    ON workspaces(owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_personal_owner
    ON workspaces(owner_user_id)
    WHERE kind = 'PERSONAL';

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL
        CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, user_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
    ON workspace_members(user_id, workspace_id);

CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    parent_experiment_id TEXT,
    source_run_id TEXT,
    purpose TEXT NOT NULL DEFAULT 'RESEARCH'
        CHECK (purpose IN ('RESEARCH', 'BENCHMARK', 'DETAILED_RERUN')),
    status TEXT NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    name TEXT,
    strategy_id TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    strategy_version INTEGER,
    result_schema_version INTEGER,
    application_version TEXT,
    instrument TEXT NOT NULL,
    strategy_timeframe TEXT NOT NULL,
    execution_timeframe TEXT NOT NULL,
    from_time TEXT NOT NULL,
    to_time TEXT NOT NULL,
    config_json TEXT NOT NULL,
    requested_runs INTEGER NOT NULL DEFAULT 0,
    valid_runs INTEGER NOT NULL DEFAULT 0,
    completed_runs INTEGER NOT NULL DEFAULT 0,
    failed_runs INTEGER NOT NULL DEFAULT 0,
    dataset_rows INTEGER,
    candle_evaluations INTEGER,
    wall_time_ms INTEGER,
    d1_query_count INTEGER,
    d1_rows_read INTEGER,
    d1_duration_ms REAL,
    error_json TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id),
    FOREIGN KEY (parent_experiment_id) REFERENCES experiments(id),
    FOREIGN KEY (source_run_id) REFERENCES experiment_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_experiments_workspace_created
    ON experiments(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_experiments_workspace_status
    ON experiments(workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS experiment_runs (
    id TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL,
    run_number INTEGER NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('PLANNED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    parameter_values_json TEXT NOT NULL,
    strategy_config_json TEXT NOT NULL,
    summary_json TEXT,
    detail_counts_json TEXT,
    rejection_reasons_json TEXT,
    total_trades INTEGER,
    wins INTEGER,
    losses INTEGER,
    breakeven INTEGER,
    win_rate REAL,
    total_pnl_pips REAL,
    net_pnl_account REAL,
    return_percent REAL,
    profit_factor REAL,
    max_drawdown_percent REAL,
    expectancy_pips REAL,
    average_holding_minutes REAL,
    average_mfe_pips REAL,
    average_mae_pips REAL,
    elapsed_ms INTEGER,
    error_json TEXT,
    has_trade_details INTEGER NOT NULL DEFAULT 0
        CHECK (has_trade_details IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (experiment_id, run_number),
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experiment_runs_experiment
    ON experiment_runs(experiment_id, run_number);

CREATE INDEX IF NOT EXISTS idx_experiment_runs_return
    ON experiment_runs(experiment_id, return_percent DESC);

CREATE INDEX IF NOT EXISTS idx_experiment_runs_drawdown
    ON experiment_runs(experiment_id, max_drawdown_percent ASC);

CREATE TABLE IF NOT EXISTS run_period_summaries (
    run_id TEXT NOT NULL,
    period_type TEXT NOT NULL
        CHECK (period_type IN ('MONTH', 'YEAR')),
    period_key TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    total_trades INTEGER,
    win_rate REAL,
    total_pnl_pips REAL,
    net_pnl_account REAL,
    return_percent REAL,
    profit_factor REAL,
    max_drawdown_percent REAL,
    PRIMARY KEY (run_id, period_type, period_key),
    FOREIGN KEY (run_id) REFERENCES experiment_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_period_summaries_period
    ON run_period_summaries(period_type, period_key);

CREATE TABLE IF NOT EXISTS experiment_batches (
    id TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL,
    batch_number INTEGER NOT NULL,
    first_run_number INTEGER NOT NULL,
    last_run_number INTEGER NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    attempt INTEGER NOT NULL DEFAULT 1,
    worker_request_id TEXT,
    wall_time_ms INTEGER,
    cpu_time_ms INTEGER,
    d1_query_count INTEGER,
    d1_rows_read INTEGER,
    d1_duration_ms REAL,
    error_json TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    updated_at INTEGER NOT NULL,
    UNIQUE (experiment_id, batch_number, attempt),
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experiment_batches_experiment
    ON experiment_batches(experiment_id, batch_number, attempt);

CREATE TABLE IF NOT EXISTS run_trades (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    trade_number INTEGER NOT NULL,
    side TEXT,
    result TEXT,
    entry_time INTEGER,
    exit_time INTEGER,
    entry_price REAL,
    exit_price REAL,
    units REAL,
    pnl_pips REAL,
    pnl_account REAL,
    commission_account REAL,
    mfe_pips REAL,
    mae_pips REAL,
    holding_minutes REAL,
    entry_reason TEXT,
    exit_reason TEXT,
    trade_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (run_id, trade_number),
    FOREIGN KEY (run_id) REFERENCES experiment_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_trades_run
    ON run_trades(run_id, trade_number);
