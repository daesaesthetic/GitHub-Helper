---
name: Replit schema workflow
description: Safe schema-change workflow for this Replit-managed PostgreSQL project.
---

Schema changes must remain in the project’s authoritative schema representation and flow through Replit’s development post-merge setup and Publish process. Do not add custom production migration runners or startup-time DDL intended to self-heal production.

**Why:** Replit applies development schema changes after task merges and diffs development against production during Publish; custom startup or deploy-time schema mutation bypasses the supported safety and rename-confirmation flow.

**How to apply:** Before changing persistence, inspect development data and orphans, update the schema source, validate locally, and tell the user to publish for production schema application when needed.