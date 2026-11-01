---
name: Whop refund uncertainty
description: Safe state handling when a Whop refund request or status check times out.
---

Do not reopen a refund request merely because Whop returned an error or timed out after a refund may have been issued. Keep the claim in `processing` until a verified payment read confirms completion, a confirmed partial refund requiring review, or no refund and safe retry.

For owner-facing stalled-refund warnings, derive the warning from the latest queue status-check attempt rather than persisting a separate refund state. Keep the request in `processing` and let owners retry verification later.

**Why:** Provider errors can leave the outcome unknown; reopening immediately can allow another owner action to issue the same refund again or tell the creator the refund is no longer being handled.

**How to apply:** For Whop refund calls and reconciliation, distinguish definitive mismatches from ambiguous provider outcomes and condition every state transition on the expected current status. In owner queues, show a safe warning for an unverified stale check without exposing provider or payment data.

Treat the last-check time as an attempted verification, not proof of a successful verification. Record it before contacting the provider; do not invent a time for legacy rows or when configuration prevents a check from starting.

**Why:** Owners need to distinguish recent failed attempts from checks that never ran, without interpreting a timestamp as refund confirmation.

**How to apply:** Keep attempt timestamps independent of refund processing age and verification outcomes.

Keep queue response deadlines separate from provider operation lifetimes. A queue wait expiring must not release an active check's concurrency slot or imply that verification failed or succeeded.

**Why:** The original provider request may still save a result; releasing its slot on the response deadline allows repeated refreshes to start overlapping checks and defeat the concurrency bound.

**How to apply:** Retain active-check ownership until the operation settles, show unresolved stale rows as unverified, and read saved results on subsequent refreshes.

Automatic verification cooldowns must not suppress an explicit owner retry after the previous check has settled; all entry points must still exclude overlapping checks.

**Why:** A failed manual check triggers a queue refetch, which must not silently repeat the provider call. Owners still need a deliberate way to retry without waiting for automatic polling.

**How to apply:** Separate automatic cooldown eligibility from active-check ownership. Keep attempt writes committed even when provider work fails, and bound lock-holding operations so they leave database connections available for those writes.
