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

-- Prospect searches (saved searches with results)
CREATE TABLE IF NOT EXISTS prospect_searches (
  id SERIAL PRIMARY KEY,
  source_company VARCHAR(255) NOT NULL,
  source_domain VARCHAR(255),
  competitors JSONB DEFAULT '[]',
  titles_used JSONB DEFAULT '[]',
  prospects_count INTEGER DEFAULT 0,
  search_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS prospect_searches_timestamp ON prospect_searches(search_timestamp DESC);
CREATE INDEX IF NOT EXISTS prospect_searches_company ON prospect_searches(source_company);

-- Saved prospects from searches
CREATE TABLE IF NOT EXISTS saved_prospects (
  id SERIAL PRIMARY KEY,
  search_id INTEGER NOT NULL REFERENCES prospect_searches(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(500),
  company VARCHAR(255),
  linkedin_url TEXT,
  enrichment_status VARCHAR(50) DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS saved_prospects_search_id ON saved_prospects(search_id);
