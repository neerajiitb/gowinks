CREATE TABLE shop_presence (
  tab TEXT PRIMARY KEY, visitor TEXT NOT NULL, room TEXT NOT NULL,
  product TEXT NOT NULL, region TEXT NOT NULL, seen INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX shop_presence_seen ON shop_presence(seen);
--> statement-breakpoint
CREATE INDEX paid_order_created ON orders(json_extract(data,'$.created'))
  WHERE json_extract(data,'$.payment') IS NOT NULL;
