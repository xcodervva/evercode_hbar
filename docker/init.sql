CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  log_level VARCHAR(10),
  message TEXT,
  context JSONB
);
