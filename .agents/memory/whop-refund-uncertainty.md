---
name: Whop refund uncertainty
description: Safe state handling when a Whop refund request or status check times out.
---

Do not reopen a refund request merely because Whop returned an error or timed out after a refund may have been issued. Keep the claim in `processing` until a verified payment read confirms completion, a confirmed partial refund requiring review, or no refund and safe retry.

**Why:** Provider errors can leave the outcome unknown; reopening immediately can allow another owner action to issue the same refund again or tell the creator the refund is no longer being handled.

**How to apply:** For Whop refund calls and reconciliation, distinguish definitive mismatches from ambiguous provider outcomes and condition every state transition on the expected current status.
