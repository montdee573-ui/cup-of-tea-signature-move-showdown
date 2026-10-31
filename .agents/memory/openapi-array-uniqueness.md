---
name: OpenAPI array uniqueness
description: How generated Zod schemas handle OpenAPI uniqueItems constraints.
---

Orval-generated Zod schemas in this workspace do not enforce OpenAPI `uniqueItems: true` for arrays. Server routes that require distinct selected values must check duplicates explicitly.

**Why:** generated validation accepted repeated variant and placement IDs, which could cause redundant mockup requests.

**How to apply:** inspect generated schemas after adding OpenAPI array constraints; enforce important uniqueness rules in the route when codegen omits them.
