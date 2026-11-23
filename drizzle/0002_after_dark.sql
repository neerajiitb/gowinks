CREATE TABLE after_dark_sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX after_dark_expiry ON after_dark_sessions(expires);
