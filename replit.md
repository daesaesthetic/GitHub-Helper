# Developer Intelligence Platform

## Purpose

This is a Discord-native developer intelligence platform. The current implementation is the Phase 1 foundation vertical slice only.

## Current architecture

The application is a TypeScript modular monolith:

`Discord interaction → identity extraction → command handler → application use case → ProjectService → Discord response`

The HTTP layer exposes `/health` for operational diagnostics. The project repository is currently in memory and is intentionally replaceable with PostgreSQL later.

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

It accepts the deterministic development project, checks the Discord user ID against the project owner, and returns the project name, status, description, owner, and integration state. GitHub is explicitly reported as **Not connected**.

The seed project is temporary development data:

- ID: `project-dev-platform`
- Name: `Developer Intelligence Platform`
- Status: `Development`
- Owner: `AUTHORIZED_USER_ID`, or the development fallback when that variable is absent

## Running locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
4. Set `AUTHORIZED_USER_ID` to the Discord user who may view the seed project.
5. Run `npm run build && npm start`.

The application registers the global `project status` command at startup and serves `GET /health` on `PORT` (default `3000`).

## Required environment variables

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`

Optional:

- `PORT`
- `AUTHORIZED_USER_ID`

Secrets must never be committed or logged. GitHub, AI, PostgreSQL, Context Engine, Reality Layer, Developer Vault, Project Intelligence, desktop functionality, and destructive operations are planned only; they are not implemented.