---
name: Workspace declaration freshness
description: Rebuild referenced library declarations before debugging downstream TypeScript errors.
---

When an API artifact reports errors that conflict with current library source or generated schemas, run `pnpm run typecheck:libs` before changing the API code.

**Why:** The API package can resolve generated declaration output from workspace libraries that is older than their current source, producing misleading type errors.

**How to apply:** Refresh the workspace library project references once, then rerun the API typecheck or test command to distinguish stale-output errors from real source issues.
