CREATE TABLE IF NOT EXISTS import_progress (
    instrument TEXT NOT NULL,
    granularity TEXT NOT NULL,
    source TEXT NOT NULL,

    next_time INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    PRIMARY KEY (
        instrument,
        granularity,
        source
    )
) WITHOUT ROWID;


CREATE TABLE IF NOT EXISTS import_usage (
    usage_date TEXT NOT NULL,
    rows_inserted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,

    PRIMARY KEY (usage_date)
) WITHOUT ROWID;


/*
 January 2021 has already been imported successfully,
 so continue from 1 February 2021.
*/
INSERT OR IGNORE INTO import_progress (
    instrument,
    granularity,
    source,
    next_time,
    updated_at
)
VALUES (
    'EUR_USD',
    'M1',
    'oanda',
    1612137600000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
);


/*
 We have already written ~28.3k candle rows today.
 Record 30k to deliberately leave some safety headroom.
*/
INSERT OR IGNORE INTO import_usage (
    usage_date,
    rows_inserted,
    updated_at
)
VALUES (
    '2026-09-01',
    30000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
);