---
name: Whop API contracts
description: Avoid misdiagnosing ownership or billing from missing legacy endpoint fields.
---

Whop legacy variant responses and current plan responses do not share identical ownership and billing fields. Missing fields are not evidence that a plan belongs to the wrong business or uses recurring billing.

**Why:** live plan reads identified the correct business and a one-time offer through company and plan_type, while checks expecting account and billing_type incorrectly suggested a mismatch.

**How to apply:** inspect the actual response contract and distinguish absent fields from conflicting values before changing catalog resources or environment configuration. Verify tax collection separately from the base price.
