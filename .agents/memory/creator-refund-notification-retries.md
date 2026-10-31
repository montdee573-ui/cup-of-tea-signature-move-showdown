---
name: Creator refund notification retries
description: Keep refund email delivery retries isolated from payment/refund operations.
---

Treat creator refund email delivery as a separate outcome from issuing or reconciling a refund. A failed or uncertain notification must not trigger a second refund. Claim each send atomically and reuse the same provider idempotency key across retries so a repeated request cannot send duplicate updates.

**Why:** Refund outcomes and email delivery can fail independently, and a provider may accept an email even when the caller does not receive a successful response.

**How to apply:** For future owner-controlled notification retries, require a verified completed refund, transition only eligible failed notification state into a sending claim, and never call the refund endpoint from the retry path.
