# Developer Intelligence Platform

## Purpose

This is a Discord-native developer intelligence platform. The current implementation includes the Phase 1 foundation, Phase 2 GitHub integration foundation, Phase 3 Context Engine foundation, Phase 4 Reality Layer foundation, Phase 5 Project Intelligence foundation, persistent project milestones, bounded GitHub Activity Intelligence, and a durable GitHub connection foundation for future user-owned access.

## Current architecture

The application is a TypeScript modular monolith:

`Discord interaction → identity extraction → command handler → application use case → ProjectIntelligenceService / ProjectService / MilestoneService / GitHubActivityService → ContextService / RealityService / GitHub service → ContextStore / RealityStore / MilestoneStore / GitHub client → PostgreSQL / GitHub API`

The HTTP layer exposes `/health` for operational diagnostics. The project repository remains an in-memory deterministic development seed; Context Engine, Reality Layer, milestones, and the new GitHub connection foundation are stored durably in the provisioned PostgreSQL database. Discord commands never construct GitHub API requests or access persistence directly.

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

The Project Intelligence foundation adds:

`/intelligence project`

It combines authorized Project state, current GitHub status, bounded recent GitHub activity, verified Reality facts, and clearly labeled Context evidence into a deterministic project summary. It is a computed view, not an AI chatbot and not another persistence layer.

Persistent milestones add:

`/milestone list`, `/milestone create`, `/milestone update`, `/milestone status`, and `/milestone delete`

They let the authorized project owner establish, view, change, order, and remove explicit project milestones. Milestones are project-owned state; they are not inferred from Context, README content, GitHub activity, or AI.

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

## Project Intelligence

### Computed interpretation

Project Intelligence is a read-only application layer. It retrieves data through `ProjectService`, `RealityService`, and `ContextService`; it does not access Context or Reality tables directly and does not persist derived health results.

The result includes project identity, current state, current GitHub repository status when available, bounded activity when available, verified Reality facts, limited supporting Context evidence, milestone availability, an explainable health state, and a generation timestamp.

### Precedence and evidence

Verified Reality is the primary source for normalized current project state. If no verified project-status Reality fact exists, structured Project state is used. Context is included only as labeled supporting evidence and never changes project state, health, or Reality data.

### Health

Health is a deterministic state, never a score:

- `active` — an established active/development project state with a connected, non-archived, non-disabled repository
- `healthy` — an established non-active state with a connected, active repository
- `attention` — a configured repository is archived/disabled or unavailable because it has not been configured
- `unknown` — the project state or configured repository availability cannot be established
- `blocked` — reserved for future authoritative blocked-state signals; Phase 5 does not infer it from Context

Every health response includes the structured state, GitHub availability, verified Reality count, and milestone availability reasons used to produce it.

### GitHub Activity Intelligence

GitHub activity is a read-only, on-demand external evidence layer. `GitHubActivityService` authorizes project access through `ProjectService`, then retrieves activity only through the existing GitHub service and client. It does not persist API results.

The service retrieves at most five recent items of each supported type by default, and the GitHub client caps every request at ten:

- Commits: SHA, optional author, first-line message, timestamp, and URL
- Issues: number, title, state, optional author, creation/update timestamps, and URL
- Pull requests: number, title, state, optional author, creation/update timestamps, and URL

The GitHub issues endpoint can include pull requests; those responses are excluded from the issue list. Empty lists mean no matching recent activity was returned. API failures are represented as an explicit unavailable reason, never as zero activity.

Activity is shown concisely in `/intelligence project` with counts, open issue/pull-request counts, the latest commit when one exists, and retrieval time. It is not automatically stored in Context or promoted into Reality, cannot complete/change milestones, and does not affect deterministic health.

### Milestones

`project_milestones` is the authoritative persistent milestone store. Milestones have a stable ID, project ID, title, optional description, explicit status, non-negative position, timestamps, and an optional completion timestamp. Valid statuses are `current`, `upcoming`, and `completed`.

Milestones are ordered by explicit position and then creation time. PostgreSQL and the milestone service enforce at most one `current` milestone per project. An empty project reports `Milestones: none configured`; no current, completed, upcoming, or percentage progress is inferred.

Project Intelligence consumes milestones through `MilestoneService` and reports them as project state. Milestones enrich Intelligence but do not independently change project health.

The seed project is temporary development data:

- ID: `project-dev-platform`
- Name: `Developer Intelligence Platform`
- Status: `Development`
- Owner: `AUTHORIZED_USER_ID`, or the development fallback when that variable is absent

## GitHub authentication, connections, and credential resolution

The current Phase 2 authentication model is a development-only, secret-based credential. Store `GITHUB_TOKEN` in Replit Secrets or an uncommitted local `.env` file; it is not stored in the project model or source code.

GitHub is optional. To link the development project, set these variables together:

- `GITHUB_TOKEN` — GitHub token with read access to the configured repository
- `GITHUB_OWNER` — Repository owner or organization
- `GITHUB_REPOSITORY` — Repository name
- `GITHUB_REPOSITORY_ID` — Optional stable repository reference

The configured owner, repository, and optional repository ID are stored as a structured project integration reference. The credential remains in configuration only. If any GitHub variable is supplied, `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPOSITORY` must all be present or startup fails with a safe configuration error.

The development token is a fallback, not a user-owned connection. User-owned GitHub App access is optional and does not prevent development startup.

### GitHub App configuration and connection flow

When all of these optional values are configured, the application enables GitHub App authorization:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_CALLBACK_URL`

`/github connect` authorizes the project owner, creates an expiring one-time server-side state record, and starts the GitHub App installation flow. The callback exchanges the OAuth code, verifies the GitHub user, validates the supplied installation through App JWT authentication, and creates or updates the durable connection.

The App private key is configuration-only. App JWTs and installation tokens are short-lived, generated only when needed, and never logged, returned to Discord, or persisted.

### Durable identity, repository selection, and lifecycle

The durable model keeps Discord account, numeric GitHub identity, App installation, GitHub repository, and project distinct. `/github status` returns safe connection metadata. `/github repositories` retrieves bounded installation-scoped repository metadata and presents up to Discord's 25-option selection limit. Selected repositories are revalidated server-side and stored through the project repository association service. `/github disconnect` marks the active user-owned connection disconnected without deleting Context, Reality, Intelligence, or milestones.

### Project-specific credentials

`GitHubCredentialResolver` is the only project credential boundary. It authorizes through `ProjectService` before selecting a credential:

1. An active user-owned association and installation token
2. The configured development `GITHUB_TOKEN`
3. Unavailable

`ProjectService` supplies the resolved token to the existing GitHub client/service for project status, Context ingestion, bounded Activity, and Intelligence's existing lower-level requests. No consumer independently chooses credentials. Unauthorized project access never reaches either credential source.

### Persistence

The GitHub connection schema source is `src/github-connections/schema.sql`. It creates only the following tables:

- `discord_accounts`
- `github_identities`
- `github_connections`
- `project_github_repositories`
- `github_authorization_states`

Important constraints include unique Discord user IDs, unique numeric GitHub user IDs, unique installation IDs when supplied, one repository association per project, a unique connection/repository pair, state nonce uniqueness, lifecycle status checks, foreign keys from connections to durable accounts/identities, and a partial expiry index for unconsumed authorization states. No table stores access tokens, OAuth tokens, App JWTs, client secrets, or private keys.

The project model itself remains the existing deterministic in-memory seed. The association tables use stable project IDs, allowing durable connection data to be introduced without creating a competing project authorization system. Persisting a full mutable project catalog remains a separate future decision.

## Running locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
4. Set `AUTHORIZED_USER_ID` to the Discord user who may view the seed project.
5. Optionally set the complete GitHub development configuration described above.
6. Run `npm run build && npm start`.

The application registers the global `project status`, `context project`, `reality project`, `intelligence project`, and `milestone` commands at startup and serves `GET /health` on `PORT` (default `3000`).

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
- Intelligence is project-scoped, performs the same authorization before reading source data, and never promotes Context evidence into Reality.
- GitHub activity is project-scoped, bounded, read-only, and retrieved only after project authorization. It never exposes GitHub credentials or raw API errors.
- Milestone reads and mutations are project-scoped and always authorize through `ProjectService`; Discord handlers never access milestone storage directly.
- GitHub connection records never store raw GitHub credentials. Authorization-state nonces use Node cryptographic randomness, expire, and can be consumed only once. User-owned connections and repository associations are checked against the requesting Discord user at the service boundary.
- No background polling, continuous synchronization, broad Discord ingestion, or cache is used in this phase.

## Testing and verification

Automated tests use mocked GitHub API responses and cover valid/incomplete configuration, successful authenticated-user and repository reads, unauthorized/not-found/rate-limited/unavailable responses, project linking, protected project access, and Discord status formatting. Activity tests cover bounded commit, issue, and pull-request retrieval; issue/PR separation; typed mapping; malformed/unavailable responses; authorization; and Intelligence formatting. Context tests cover typed record validation, store filtering and deletion, project authorization, GitHub metadata/README provenance, idempotent ingestion, safe ingestion failure, and `/context project` behavior. Reality tests cover model validation, persistence operations, verification-state updates, supporting-context validation, project isolation, and `/reality project` authorization. Intelligence tests cover deterministic active, attention, and unknown health; explainable reasons; Reality precedence; labeled Context evidence; activity presentation without Reality/milestone/health inference; project isolation; and `/intelligence project` authorization and formatting. Milestone tests cover validation, create/update/status/delete behavior, completion timestamps, deterministic ordering, a single current milestone, authorization, project isolation, Intelligence integration, and milestone command behavior. Tests never require a live GitHub credential.

Run:

```bash
npm test
npm run typecheck
npm run build
```

Live verification was completed successfully after configuring the Discord and GitHub credentials. Discord command connectivity and registration were verified live, GitHub authentication and repository connection were verified, and the following Phase 1–4 commands worked:

- `/project status`
- `/context project`
- `/reality project`

Repeated `/context project` calls remained idempotent, and `/reality project` returned the expected three verified facts. This records successful live verification for Phase 4; no implementation behavior was changed by the verification.

Phase 5 runtime verification completed successfully: the application registered `/intelligence project`, connected to Discord, passed its health check, and the authorized Intelligence service ran against the configured GitHub repository and development database. It reported `active` health, `Development` state, a connected repository, the three expected verified Reality facts, one Context evidence record, and an unavailable milestone state. The Discord handler itself is covered by automated command tests; no synthetic Discord interaction was sent during runtime verification.

Persistent milestone runtime verification completed successfully against PostgreSQL using a clearly labeled temporary milestone. It was created, listed, updated, transitioned to current when no conflicting current milestone existed, marked completed with a completion timestamp, included in the Intelligence summary, deleted, and confirmed absent afterward. The bot registered all milestone commands and connected to Discord; mutation handlers are covered by automated command tests, and no synthetic Discord interaction was sent.

GitHub Activity Intelligence runtime verification completed successfully against the configured repository. The authorized project status, Reality, milestone, activity, and Intelligence service paths all ran successfully. Activity returned five bounded recent commits, no recent issues, no recent pull requests, and a latest commit timestamp. Repeated activity and Intelligence retrieval left Context, Reality, and milestone record counts unchanged. No activity persistence table exists, health remained `active`, and the bot registered commands, connected to Discord, and passed its health check. Discord formatting is covered by automated command tests; no synthetic Discord interaction was sent.

## Intentionally deferred

Not implemented: GitHub App/OAuth browser onboarding, App configuration, OAuth callback, installation onboarding, token exchange/refresh, Discord GitHub connection commands, repository-selection UI, webhooks, commits, issues, pull requests, branches, file edits, releases, Actions, deployments, repository synchronization, automatic milestone detection, percentage progress, milestone reminders, embeddings, vector search, semantic search, AI summaries, AI memory extraction, Developer Vault, broad Discord ingestion, full repository indexing, desktop functionality, Replit integration, autonomous agents, and destructive GitHub operations.