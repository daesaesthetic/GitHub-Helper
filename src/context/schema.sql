CREATE TABLE IF NOT EXISTS context_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN (
    'user', 'project', 'repository', 'discord_guild', 'discord_channel', 'conversation'
  )),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'github_repository', 'github_file', 'github_documentation',
    'discord_message', 'discord_conversation', 'user_authored'
  )),
  source_identity TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  source_timestamp TIMESTAMPTZ,
  UNIQUE (project_id, source_type, source_identity)
);

CREATE INDEX IF NOT EXISTS context_records_project_updated_idx
  ON context_records (project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS context_records_source_idx
  ON context_records (source_type, source_identity);