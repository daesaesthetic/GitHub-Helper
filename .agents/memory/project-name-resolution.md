---
name: Project name resolution
description: Project-scoped Discord inputs may use project IDs or display names without weakening authorization.
---

Resolve project identifiers inside the ProjectService authorization boundary: exact IDs take precedence, display names match case-insensitively only among the requesting owner’s projects, and duplicate names require an ID.

**Why:** A shared resolver keeps command usability consistent while ensuring persistence and external integrations always receive canonical project IDs.

**How to apply:** Convert a user-provided project identifier to the authorized project before invoking Context, Reality, milestone, intelligence, activity, or GitHub connection operations.