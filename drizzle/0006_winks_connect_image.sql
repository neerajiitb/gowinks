UPDATE connect_events
SET data = json_set(data, '$.image', '/images/winks-connect.webp'), revision = revision + 1
WHERE json_extract(data, '$.image') = '/images/wings-connect.webp';
