---
name: Workspace declaration freshness
description: Rebuild referenced library declarations before debugging downstream TypeScript errors.
---

When an API artifact reports errors that conflict with current library source or generated schemas, refresh the generated declarations before changing API code: run `pnpm run typecheck:libs` for stale workspace library outputs, or `pnpm --filter @workspace/api-spec run codegen` when generated API contracts lag behind OpenAPI.

**Why:** The API package can resolve generated declaration output from workspace libraries that is older than their current source, producing misleading type errors.

**How to apply:** Choose the refresh command based on the mismatch, then rerun the API typecheck or test command to distinguish stale outputs from real source issues.
