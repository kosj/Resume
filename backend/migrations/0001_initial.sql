PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, started_at INTEGER NOT NULL,
 landing TEXT NOT NULL, referrer TEXT NOT NULL, source TEXT NOT NULL,
 medium TEXT NOT NULL, campaign TEXT NOT NULL,
 channel TEXT NOT NULL, device TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_started ON sessions(started_at);
CREATE TABLE IF NOT EXISTS pageviews (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
 at INTEGER NOT NULL, path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pageviews_at ON pageviews(at);
CREATE INDEX IF NOT EXISTS pageviews_session ON pageviews(session_id);
