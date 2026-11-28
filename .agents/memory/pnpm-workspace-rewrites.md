---
name: pnpm workspace rewrites
description: A local pnpm dependency add may rewrite workspace configuration beyond the package change.
---

After adding a dependency with pnpm, inspect both `pnpm-workspace.yaml` and `pnpm-lock.yaml`. The local install rewrote workspace ordering and quoting, removed explanatory security comments, and pinned the Zod catalog range while only adding API dependencies. Keep unrelated workspace settings and catalog ranges unchanged, and make the lockfile catalog specifier match the preserved workspace range.

**Why:** Broad configuration churn can hide an unintended change to supply-chain safeguards and makes dependency updates harder to review.

**How to apply:** Review the workspace and lockfile diff after package changes; restore unrelated formatting or comments and verify the lockfile remains aligned before finishing.
