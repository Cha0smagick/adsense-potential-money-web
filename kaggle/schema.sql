-- AdSense Approval & Rejection Dataset — esquema SQLite
CREATE TABLE cases (
  case_id TEXT PRIMARY KEY,
  site_key TEXT NOT NULL,
  site_url TEXT NOT NULL,
  host TEXT NOT NULL,
  registrable TEXT,
  platform TEXT,
  outcome TEXT CHECK (outcome IN ('approved','rejected','pending','unknown')),
  outcome_source TEXT,
  source_type TEXT,
  source_url TEXT,
  date TEXT,
  stale INTEGER CHECK (stale IN (0,1)),
  reachable INTEGER CHECK (reachable IN (0,1) OR reachable IS NULL),
  score REAL,
  confidence REAL,
  gates TEXT,
  words INTEGER,
  content_pages INTEGER,
  privacy TEXT,
  adsense_code INTEGER CHECK (adsense_code IN (0,1) OR adsense_code IS NULL),
  can_monetize INTEGER CHECK (can_monetize IN (0,1) OR can_monetize IS NULL),
  title TEXT,
  label_conflict INTEGER DEFAULT 0,
  included_in_calibration INTEGER DEFAULT 0,
  notes TEXT
);
CREATE UNIQUE INDEX idx_cases_site_key ON cases(site_key);
CREATE INDEX idx_cases_outcome ON cases(outcome);
CREATE INDEX idx_cases_included ON cases(included_in_calibration);

CREATE TABLE posts (
  post_id TEXT PRIMARY KEY,
  created_utc INTEGER,
  date TEXT,
  title TEXT,
  outcome TEXT,
  site_count INTEGER,
  sites TEXT,
  source_url TEXT
);
CREATE INDEX idx_posts_outcome ON posts(outcome);

CREATE TABLE tranco_sites (
  domain TEXT PRIMARY KEY,
  url TEXT,
  score REAL,
  confidence REAL,
  gates TEXT,
  words INTEGER,
  content_pages INTEGER,
  privacy TEXT,
  can_monetize INTEGER,
  title TEXT
);

CREATE TABLE forum_cases (
  case_id TEXT PRIMARY KEY,
  site TEXT,
  outcome TEXT,
  date TEXT,
  score REAL,
  stale INTEGER,
  reachable INTEGER,
  words INTEGER,
  adsense_code INTEGER,
  source TEXT
);

CREATE TABLE calibration_bands (
  band TEXT PRIMARY KEY,
  min REAL,
  max REAL,
  positives INTEGER,
  negatives INTEGER,
  lr REAL,
  lr_low REAL,
  lr_high REAL,
  prior REAL,
  posterior REAL
);

CREATE TABLE calibration_meta (key TEXT PRIMARY KEY, value TEXT);

CREATE VIEW calibration_ready AS
SELECT * FROM cases WHERE included_in_calibration = 1;
