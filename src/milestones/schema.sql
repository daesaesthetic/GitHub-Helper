CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('current', 'upcoming', 'completed')),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS project_milestones_one_current_idx
  ON project_milestones (project_id)
  WHERE status = 'current';

CREATE INDEX IF NOT EXISTS project_milestones_project_order_idx
  ON project_milestones (project_id, position ASC, created_at ASC);