---
name: Shared-state test doubles
description: Keep in-memory database adapters faithful to production transaction behavior in shared-state tests.
---

For throttling or other shared-state behavior, test adapters should serialize transactions like the production database, and request tests should seed data with the IP observed by the route rather than assuming a loopback format.

**Why:** API tests replace PostgreSQL with an in-memory adapter, while proxy configuration can change the client IP string used as the state key.

**How to apply:** When adding shared-state API tests, mirror relevant transaction guarantees in the adapter and use a stable, observed request key for expiry cases.
