CREATE TABLE IF NOT EXISTS reality_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  fact_type TEXT NOT NULL CHECK (fact_type IN (
    'project_identity', 'project_status', 'github_repository'
  )),
  value JSONB NOT NULL,
  verification_state TEXT NOT NULL CHECK (verification_state IN (
    'verified', 'pending', 'invalidated'
  )),
  supporting_context_id TEXT REFERENCES context_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS reality_records_project_updated_idx
  ON reality_records (project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS reality_records_project_state_idx
  ON reality_records (project_id, verification_state);