INSERT INTO config (id, data)
VALUES ('activity', '{"whatsapp":true,"phone":"919958394825"}')
ON CONFLICT(id) DO UPDATE SET data = json_patch(config.data, excluded.data);
