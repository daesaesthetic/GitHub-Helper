# Developer Intelligence Platform

Discord-native developer intelligence platform foundation.

This repository contains the Phase 1 foundation vertical slice: a TypeScript modular monolith with one read-only Discord command, an in-memory project service, centralized identity and authorization, structured logging, and a health endpoint.

## Current functionality

```text
/project status
GET /health
```

The project status command reports the temporary development project and explicitly shows `GitHub: Not connected`.

## Requirements

- Node.js 20+
- A Discord application and bot token for live Discord verification

## Setup

```bash
npm install
cp .env.example .env
```

Set these values in `.env`:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `AUTHORIZED_USER_ID`

Optional:

- `PORT` (defaults to `3000`)

## Development

```bash
npm run dev
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The application intentionally does not yet include GitHub, Replit, AI, PostgreSQL, Context Engine, Reality Layer, Developer Vault, Project Intelligence, desktop functionality, or destructive operations.