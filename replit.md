# Developer Intelligence Platform

## Purpose

This is a Discord-native developer intelligence platform. The current implementation includes the Phase 1 foundation, Phase 2 GitHub integration foundation, Phase 3 Context Engine foundation, and Phase 4 Reality Layer foundation.

## Current architecture

The application is a TypeScript modular monolith:

`Discord interaction → identity extraction → command handler → application use case → ProjectService → ContextService / RealityService / GitHub service → ContextStore / RealityStore / GitHub client → PostgreSQL / GitHub API`

The HTTP layer exposes `/health` for operational diagnostics. The project repository remains in memory; Context Engine and Reality Layer records are stored durably in the provisioned PostgreSQL database. Discord commands never construct GitHub API requests or access persistence directly.

## Technology stack

- Node.js
- TypeScript
- discord.js 14
- Node.js HTTP server
- Node built-in test runner
- PostgreSQL via the provisioned Replit database

## Implemented functionality

User-facing commands:

`/project status`

It accepts the deterministic development project, checks the Discord user ID against the project owner, and returns the project name, status, description, owner, and GitHub status.

When GitHub development configuration is present, it uses the configured credential to read:

- The authenticated GitHub account
- Repository identity and URL
- Repository visibility
- Default branch
- Basic repository status (active, archived, or disabled)

The command only exposes safe repository metadata. GitHub credential, headers, raw API errors, and stack traces are never included in Discord responses.

When GitHub is not configured, `/project status` reports **GitHub: Not connected**. Invalid credentials, inaccessible repositories, rate limits, malformed API responses, and network/API failures report a concise **GitHub: Unavailable** state.

The Context Engine adds:

`/context project`

It authorizes the requesting Discord user, ingests the configured repository's limited source context when available, and reports the project-scoped context record count, source types, and basic source/provenance information. It is a retrieval and verification interface, not an AI chat command.

The Reality Layer adds:

`/reality project`

It authorizes the requesting Discord user and returns a concise list of deterministic, project-scoped Reality facts and their verification states. It is the verified-state view; it does not return raw Context records.

## Context Engine

### Context model and provenance

Each record has a stable ID, project ID, bounded scope, bounded source type, stable source identity, source content, metadata, provenance, creation/update timestamps, and an optional source timestamp.

Supported source types are GitHub repository, GitHub file, GitHub documentation, Discord message, Discord conversation, and user-authored context. Only GitHub repository metadata and GitHub README/documentation are ingested in this phase. Discord source types exist for architectural compatibility only.

Provenance is preserved rather than fabricated. GitHub-derived records include only available repository owner, repository name, repository ID, file path, source URL, and source reference values.

### Scope and retrieval

The model supports user, project, repository, Discord guild, Discord channel, and conversation scopes. The operational scope for this phase is project scope. `ContextService` is the application-facing retrieval boundary and checks existing project ownership authorization before returning or deleting project context.

### Persistence

`context_records` is the only Context Engine table. Its schema source is `src/context/schema.sql`; it stores records, JSON metadata/provenance, source identity, and timestamps, with indexes for project and source retrieval. The schema was applied to the development database. Application startup does not run database DDL.

### GitHub ingestion

`GitHubContextIngestionService` converts actual GitHub repository metadata and an available README into project-scoped records. It uses stable repository/readme source identities and upserts them, so repeated ingestion does not create duplicate records. A changed source updates the same stable context record; this phase does not maintain a full historical version system.

The ingestion path does not ingest the whole repository, recursively inspect files, or process likely secret-bearing paths such as `.env`, credentials, keys, or PEM files.

## Reality Layer

### Reality versus Context

Context is the source/evidence layer: it answers “What information has been collected?” Reality is the distinct normalized project-state layer: it answers “What do we currently believe is true about this project?”

Reality is never created by copying all Context records. README content is never automatically promoted. A Reality fact may optionally reference a supporting Context record, but it is only established through an explicit deterministic operation.

### Model and verification

Reality records have a stable ID, project ID, bounded fact type, structured value, verification state, optional supporting Context record ID, and timestamps.

Current fact types are project identity, project status, and configured GitHub repository association. Current verification states are:

- `verified` — deterministically established from project configuration/state
- `pending` — recorded but not yet verified
- `invalidated` — no longer considered current

`ProjectRealityBootstrap` establishes only conservative facts that already exist in the authoritative project model. It does not infer functionality from documentation or source context.

### Persistence and access

`reality_records` is the Reality Layer table. Its schema source is `src/reality/schema.sql`; it stores project-scoped facts, structured values, verification state, optional supporting context, and timestamps. The schema was applied to the development database. Application startup does not run database DDL.

`RealityService` is the application-facing boundary. It authorizes project access before establishing, retrieving, updating, invalidating, or removing Reality facts. A supporting Context reference must exist and belong to the same project.

The seed project is temporary development data:

- ID: `project-dev-platform`
- Name: `Developer Intelligence Platform`
- Status: `Development`
- Owner: `AUTHORIZED_USER_ID`, or the development fallback when that variable is absent

## GitHub development authentication and linking

The current Phase 2 authentication model is a development-only, secret-based credential. Store `GITHUB_TOKEN` in Replit Secrets or an uncommitted local `.env` file; it is not stored in the project model or source code.

GitHub is optional. To link the development project, set these variables together:

- `GITHUB_TOKEN` — GitHub token with read access to the configured repository
- `GITHUB_OWNER` — Repository owner or organization
- `GITHUB_REPOSITORY` — Repository name
- `GITHUB_REPOSITORY_ID` — Optional stable repository reference

The configured owner, repository, and optional repository ID are stored as a structured project integration reference. The credential remains in configuration only. If any GitHub variable is supplied, `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPOSITORY` must all be present or startup fails with a safe configuration error.

This is deliberately not a full production authorization flow. The GitHub client/service boundary can later be backed by a GitHub App or OAuth user authorization without changing Discord command behavior.

## Running locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
4. Set `AUTHORIZED_USER_ID` to the Discord user who may view the seed project.
5. Optionally set the complete GitHub development configuration described above.
6. Run `npm run build && npm start`.

The application registers the global `project status`, `context project`, and `reality project` commands at startup and serves `GET /health` on `PORT` (default `3000`).

## Required environment variables

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`

Optional:

- `PORT`
- `AUTHORIZED_USER_ID`
- `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPOSITORY` (required together to enable the development GitHub integration)
- `GITHUB_REPOSITORY_ID`

## Security and authorization

- GitHub credentials must come from environment variables or Replit Secrets and must never be committed, logged, returned to Discord, or stored on a project.
- Project authorization occurs before any GitHub request. The development integration is limited to the configured project owner.
- GitHub API communication is centralized behind the GitHub client and service, with typed API responses and safe normalized failure categories.
- Context content is not logged. Unauthorized users cannot retrieve project context.
- Reality values are project-scoped and are not logged. Unauthorized users cannot retrieve or modify project Reality.
- No background polling, continuous synchronization, broad Discord ingestion, or cache is used in this phase.

## Testing and verification

Automated tests use mocked GitHub API responses and cover valid/incomplete configuration, successful authenticated-user and repository reads, unauthorized/not-found/rate-limited/unavailable responses, project linking, protected project access, and Discord status formatting. Context tests cover typed record validation, store filtering and deletion, project authorization, GitHub metadata/README provenance, idempotent ingestion, safe ingestion failure, and `/context project` behavior. Reality tests cover model validation, persistence operations, verification-state updates, supporting-context validation, project isolation, and `/reality project` authorization. Tests never require a live GitHub credential.

Run:

```bash
npm test
npm run typecheck
npm run build
```

Live verification was completed successfully after configuring the Discord and GitHub credentials. Discord command connectivity and registration were verified live, GitHub authentication and repository connection were verified, and the following commands worked:

- `/project status`
- `/context project`
- `/reality project`

Repeated `/context project` calls remained idempotent, and `/reality project` returned the expected three verified facts. This records successful live verification for Phase 4; no implementation behavior was changed by the verification.

## Intentionally deferred

Not implemented: GitHub App/OAuth onboarding, commits, issues, pull requests, branches, file edits, releases, Actions, deployments, repository synchronization, embeddings, vector search, semantic search, AI summaries, AI memory extraction, Project Intelligence, Developer Vault, broad Discord ingestion, full repository indexing, desktop functionality, Replit integration, autonomous agents, and destructive GitHub operations.