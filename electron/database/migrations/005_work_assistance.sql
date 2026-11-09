CREATE TABLE work_assistance_state (
  work_id TEXT PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
