-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  image TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Daily credits tracking (unified for all searches)
CREATE TABLE IF NOT EXISTS daily_credits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  ip_address VARCHAR(45),
  date DATE NOT NULL,
  credits_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraints for credit tracking
CREATE UNIQUE INDEX IF NOT EXISTS daily_credits_user_date
  ON daily_credits (user_id, date) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS daily_credits_ip_date
  ON daily_credits (ip_address, date) WHERE user_id IS NULL;

-- Search history for analytics
CREATE TABLE IF NOT EXISTS searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  ip_address VARCHAR(45),
  lead_magnet_id VARCHAR(100) NOT NULL,
  query JSONB NOT NULL,
  result_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS searches_user_id ON searches(user_id);
CREATE INDEX IF NOT EXISTS searches_lead_magnet ON searches(lead_magnet_id);
CREATE INDEX IF NOT EXISTS searches_created_at ON searches(created_at);
