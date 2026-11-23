CREATE TABLE IF NOT EXISTS invitations (
  token TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT,
  phone_digest TEXT NOT NULL,
  request_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','withdrawn')),
  created_at INTEGER NOT NULL,
  UNIQUE (sender_id, request_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invitations_sent ON invitations(sender_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invitations_received ON invitations(recipient_id, created_at DESC);
