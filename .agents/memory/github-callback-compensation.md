---
name: GitHub callback compensation
description: Durable ordering and recovery rule for GitHub App callbacks.
---

GitHub App callbacks should validate the pending state and complete all external GitHub checks before consuming the one-time nonce. If connection persistence succeeds but final nonce consumption fails, restore the prior connection or mark a newly created connection disconnected.

**Why:** Consuming early prevents retries after downstream failures, while persisting first without compensation can leave an active connection from an incomplete authorization flow.

**How to apply:** Keep callback compensation scoped to the connection changed by that callback, never expose exchanged tokens, and preserve the original connection state when reconnecting an existing GitHub identity.