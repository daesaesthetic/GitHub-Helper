CREATE TABLE IF NOT EXISTS discord_accounts (
  id TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS github_identities (
  id TEXT PRIMARY KEY,
  github_user_id BIGINT NOT NULL UNIQUE,
  login TEXT NOT NULL,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS github_connections (
  id TEXT PRIMARY KEY,
  discord_account_id TEXT NOT NULL REFERENCES discord_accounts(id) ON DELETE CASCADE,
  github_identity_id TEXT NOT NULL REFERENCES github_identities(id) ON DELETE RESTRICT,
  installation_id BIGINT UNIQUE,
  github_account_id BIGINT,
  github_account_login TEXT,
  github_account_type TEXT CHECK (github_account_type IN ('User', 'Organization')),
  permission_state TEXT NOT NULL CHECK (permission_state IN ('read_only', 'unknown', 'insufficient')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disconnected', 'revoked', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  disconnected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS github_connections_account_idx ON github_connections (discord_account_id, status);

CREATE TABLE IF NOT EXISTS project_github_repositories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES github_connections(id) ON DELETE RESTRICT,
  repository_id BIGINT NOT NULL,
  owner TEXT NOT NULL,
  repository TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disconnected', 'unavailable')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (project_id),
  UNIQUE (connection_id, repository_id)
);

CREATE INDEX IF NOT EXISTS project_github_repositories_repository_idx ON project_github_repositories (repository_id);

CREATE TABLE IF NOT EXISTS github_authorization_states (
  id TEXT PRIMARY KEY,
  discord_account_id TEXT NOT NULL REFERENCES discord_accounts(id) ON DELETE CASCADE,
  state_nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  operation TEXT NOT NULL CHECK (operation IN ('connect', 'associate_repository', 'reconnect')),
  project_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS github_authorization_states_expiry_idx
  ON github_authorization_states (expires_at) WHERE consumed_at IS NULL;