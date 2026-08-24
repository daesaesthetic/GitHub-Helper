---
name: Discord input normalization
description: User-facing Discord commands should accept common pasted URL forms when a field semantically identifies a GitHub resource.
---

GitHub repository inputs in Discord should accept both short names and full GitHub URLs, while validating that a pasted URL owner matches the explicit owner field.

**Why:** Discord users commonly paste repository URLs rather than manually extracting the repository name, and rejecting that normal input produced an opaque onboarding failure.

**How to apply:** Normalize and validate at the application boundary before authorization or external API calls; keep stored project references in canonical owner/name form.