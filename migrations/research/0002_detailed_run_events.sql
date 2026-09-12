PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS run_diagnostic_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    event_number INTEGER NOT NULL,
    event_type TEXT NOT NULL
        CHECK (event_type IN ('SIGNAL', 'ORDER', 'FILL', 'REJECTION', 'RISK')),
    event_time INTEGER,
    reason TEXT,
    event_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (run_id, event_number),
    FOREIGN KEY (run_id) REFERENCES experiment_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_diagnostic_events_run
    ON run_diagnostic_events(run_id, event_number);

CREATE INDEX IF NOT EXISTS idx_run_diagnostic_events_type
    ON run_diagnostic_events(run_id, event_type, event_time);
