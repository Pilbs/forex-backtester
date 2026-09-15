PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS saved_strategies (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    strategy_type TEXT NOT NULL DEFAULT 'GENERIC'
        CHECK (strategy_type IN ('GENERIC')),
    version INTEGER NOT NULL DEFAULT 1,
    spec_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_saved_strategies_workspace_updated
    ON saved_strategies(workspace_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_strategies_workspace_name
    ON saved_strategies(workspace_id, name COLLATE NOCASE);
