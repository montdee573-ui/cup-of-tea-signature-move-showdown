---
name: Replicate model liveness
description: Limits of Replicate model metadata checks and safe preflight for paid generation.
---

Replicate account and model metadata requests can succeed while the model's underlying provider endpoint has been retired. A successful metadata check proves that the token and model record are accessible, not that a paid generation will succeed.

**Why:** An accessible Veo Lite model record returned HTTP 200 during preflight, while prediction later failed because Google's underlying generation endpoint had been retired.

**How to apply:** Prefer current, maintained model offerings; verify the model's current input schema and price; show any model or price change to the owner for approval; keep failed provider responses visible. Never use an unapproved paid prediction as a liveness probe.
