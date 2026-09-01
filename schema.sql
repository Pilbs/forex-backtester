CREATE TABLE IF NOT EXISTS candles (
    instrument TEXT NOT NULL,
    granularity TEXT NOT NULL,
    time INTEGER NOT NULL,

    volume INTEGER NOT NULL,

    bid_open REAL NOT NULL,
    bid_high REAL NOT NULL,
    bid_low REAL NOT NULL,
    bid_close REAL NOT NULL,

    ask_open REAL NOT NULL,
    ask_high REAL NOT NULL,
    ask_low REAL NOT NULL,
    ask_close REAL NOT NULL,

    mid_open REAL NOT NULL,
    mid_high REAL NOT NULL,
    mid_low REAL NOT NULL,
    mid_close REAL NOT NULL,

    source TEXT NOT NULL DEFAULT 'oanda',

    PRIMARY KEY (
        instrument,
        granularity,
        time
    )
) WITHOUT ROWID;