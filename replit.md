# Developer Intelligence Platform

## Purpose

This is a Discord-native developer intelligence platform. The current implementation includes the Phase 1 foundation and the Phase 2 GitHub integration foundation.

## Current architecture

The application is a TypeScript modular monolith:

`Discord interaction → identity extraction → command handler → application use case → ProjectService → GitHub service → GitHub client → GitHub API`

The HTTP layer exposes `/health` for operational diagnostics. The project repository is currently in memory and is intentionally replaceable with PostgreSQL later. Discord commands never construct GitHub API requests directly.

## Technology stack

- Node.js
- TypeScript
- discord.js 14
- Node.js HTTP server
- Node built-in test runner
- No database is required in this phase

## Implemented functionality

The only user-facing command is:

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

The application registers the global `project status` command at startup and serves `GET /health` on `PORT` (default `3000`).

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
- No background polling, synchronization, database persistence, or cache is used in this phase.

## Testing and verification

Automated tests use mocked GitHub API responses and cover valid/incomplete configuration, successful authenticated-user and repository reads, unauthorized/not-found/rate-limited/unavailable responses, project linking, protected project access, and Discord status formatting. Tests never require a live GitHub credential.

Run:

```bash
npm test
npm run typecheck
npm run build
```

Live GitHub verification is **not verified** until valid GitHub development configuration is supplied through Replit Secrets. When configured, verify `/project status` in Discord and `GET /health`.

## Intentionally deferred

Not implemented: GitHub App/OAuth onboarding, commits, issues, pull requests, branches, file edits, releases, Actions, deployments, repository synchronization, PostgreSQL persistence, Context Engine, Reality Layer, Project Intelligence, Developer Vault, desktop functionality, Replit integration, AI repository analysis, and destructive GitHub operations.