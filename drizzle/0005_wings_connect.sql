CREATE TABLE connect_categories(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO connect_categories VALUES ('friends','Make friends'), ('special','Meet someone special'), ('creative','Create together');
--> statement-breakpoint
CREATE TABLE connect_events(id TEXT PRIMARY KEY, owner TEXT NOT NULL, category TEXT NOT NULL REFERENCES connect_categories(id), data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE INDEX connect_host ON connect_events(owner);
--> statement-breakpoint
CREATE TABLE connect_profiles(user_id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, bio TEXT NOT NULL,
 handle TEXT UNIQUE NOT NULL DEFAULT (lower(hex(randomblob(16)))), wall INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE connect_notes(id TEXT PRIMARY KEY, handle TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX connect_notes_wall ON connect_notes(handle,created);
--> statement-breakpoint
CREATE TABLE connect_comments(id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES connect_events(id), user_id TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX connect_thread ON connect_comments(event_id,created);
--> statement-breakpoint
CREATE UNIQUE INDEX connect_booking ON orders(user_id,json_extract(data,'$.eventId')) WHERE json_extract(data,'$.eventId') IS NOT NULL AND json_extract(data,'$.status') NOT IN ('Payment setup failed','Cancelled');
--> statement-breakpoint
CREATE INDEX connect_sales ON orders(json_extract(data,'$.eventId')) WHERE json_extract(data,'$.eventId') IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER connect_capacity BEFORE INSERT ON reservations WHEN substr(NEW.product_id,1,3)='wc:' BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM connect_events e JOIN orders o ON o.id=NEW.order_id WHERE e.id=substr(NEW.product_id,4)
 AND json_extract(e.data,'$.status')='published' AND julianday(json_extract(e.data,'$.start'))>julianday('now')
 AND json_extract(e.data,'$.price')=json_extract(o.data,'$.items[0].price')
 AND NEW.qty+(SELECT coalesce(sum(qty),0) FROM reservations WHERE product_id=NEW.product_id)<=json_extract(e.data,'$.capacity')
 ) THEN RAISE(ABORT,'Event availability changed') END;
END;
--> statement-breakpoint
INSERT INTO connect_events(id,owner,category,data) VALUES
 ('rooftop-social','','friends','{"title":"The Rooftop Social","city":"Mumbai","venue":"Bandra West","address":"Bandra West, Mumbai","start":"2027-01-16T13:00:00.000Z","end":"2027-01-16T15:30:00.000Z","image":"/images/wings-connect.webp","description":"An open-air mocktail social with small-table introductions and a host to help you find your circle.","host":"Go Winks","rules":"Come solo or with a friend. Ask before exchanging contact details or taking photos.","capacity":24,"price":0,"status":"preview"}'),
 ('clay-table','','creative','{"title":"The Sunday Clay Table","city":"Bengaluru","venue":"Indiranagar","address":"Indiranagar, Bengaluru","start":"2027-01-17T06:00:00.000Z","end":"2027-01-17T08:00:00.000Z","image":"/images/experience-pottery.webp","description":"Take a seat at a shared pottery table. Make a small keepsake and meet someone over coffee while the clay dries.","host":"Go Winks","rules":"Beginners welcome. Wear something comfortable for working with clay.","capacity":16,"price":0,"status":"preview"}'),
 ('table-for-two','','special','{"title":"A Seat Across From You","city":"Delhi","venue":"Lodhi Colony","address":"Lodhi Colony, New Delhi","start":"2027-01-23T13:30:00.000Z","end":"2027-01-23T15:30:00.000Z","image":"/images/experience-cafe.webp","description":"A hosted singles evening with conversation cards, rotating seats and time to linger over a drink.","host":"Go Winks","rules":"For adults aged 18 and over. Share contact details only by mutual choice.","capacity":20,"price":0,"status":"preview"}');
