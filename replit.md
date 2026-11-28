# Viral Reel

All-sports signature-move cards, participant submissions, free community voting,
three competition stages and optional paid motion cards. Official domain:
https://sigduel.com. Preserve the existing sports design and branding.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod 4, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild API bundle and Vite static apps
- Promoter accounts: managed Clerk, separate from the existing team-only studio session

## Where things live

- `artifacts/signature-move-showdown` — public sports archive, participant workflows, promoter pages and private owner tools.
- `artifacts/api-server` — shared API, moderation, provider verification and commissions.
- `lib/api-spec/openapi.yaml` — API contracts; regenerate clients/schemas after changes.
- `LAUNCH_PLAN.md` and `docs/promoter-assisted-sales.md` — launch timeline and approved commercial rules.

## Architecture decisions

- Anonymous participation and public browsing remain available. Private creator links are bearer links, not identity verification.
- The full competition runs from launch through May 2027 Show Week. December 7–16, 2026 is only the initial promoter campaign.
- Stage 1: Create & Submit. Stage 2: Signature Move Showdown. Stage 3: Championship Brackets.
- Exact Show Week dates, stage deadlines and unresolved qualification rules require owner approval.
- Free entry and voting never depend on the optional $2-plus-tax motion card or merchandise purchases.
- Base44 remains the intended official bracket authority. Community exhibition votes are not official championship results.
- Official winners require verified data and owner clearance. Preserve clearance/correction history.
- Physical Champion Card is the intended verified-winner award; printer, artwork and ordering require approval.

## Product

- Initial target: 500 AI-generated, owner-approved professional athlete cards. Do not bulk-spend on generation or publish unreviewed athletes.
- Participants may recreate professional moves or submit original moves in any sport.
- Preserve existing Whop, Printful, Replicate and Resend integrations. No live charges, fulfillment, payouts or outreach without the necessary approvals.
- Promoter commission: $0.96 per qualifying motion card; approved shirt policy: 48% of verified eligible profit. Combined caps: $96/day and $960/ten-day campaign; statutory wages are separate.
- Eligibility, guardian consent where required and lawful work arrangements precede recruitment/work activation.
- No shared promoter/team identity. Signing into a promoter account never grants Reel Studio access.

## User preferences

Conserve credits: reuse working code, avoid redesigns and duplicate investigations,
run targeted checks, then one final integrated test before proposing republishing.
Do not send invitations or revise promotional materials without authorization.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
