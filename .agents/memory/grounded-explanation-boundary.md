---
name: Grounded explanation boundary
description: Provider-independent security boundary for future AI explanations and secret metadata.
---

Project explanations must authorize through the existing project service, select a bounded structured Intelligence package, redact credential-bearing values and structures, and enforce the returned project ID before any provider call. AI output is presentation-only and cannot mutate project state.

Secret inventory must remain metadata-only and allowlisted until a secure provider can expose metadata without exposing values. Do not create a plaintext secret table or infer metadata from arbitrary environment contents.

**Why:** The project has owner-scoped data but no secure persistent secret inventory or connected AI provider; provider-neutral boundaries prevent accidental cross-project or credential leakage while preserving a safe integration point.

**How to apply:** Keep provider SDKs behind the AI service interface, use bounded timeouts/retries, redact both provider input and Discord output, and return explicit unavailable states instead of fabricated explanations.