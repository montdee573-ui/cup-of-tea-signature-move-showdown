# Signature Move Showdown

Public NBA-style signature move contest where athletes submit a move, attach proof details, and earn a place on a live C.O.R.E.-scored leaderboard.

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
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/signature-move-showdown` — React/Vite public contest site with the board, submission flow, and entry details.
- `artifacts/api-server/src/routes/contest.ts` — contest endpoints and seed benchmark entries.
- `lib/api-spec/openapi.yaml` — source of truth for contest API contracts.
- `lib/db/src/schema/contestants.ts` — PostgreSQL schema for contest entries.

## Architecture decisions

- Contest submissions enter as `Active Submissions` with `Pending Check` and `Under Review`; scores are assigned during review rather than invented at intake.
- The board is seeded with the benchmark and example entries from the contest brief so the first view demonstrates the judging model.
- Video proof is currently tracked by filename and reference URL; binary file storage is intentionally separate from the contest record.

## Product

- Public leaderboard sorted by overall fidelity.
- Live contest stats for total entries, verified entries, average fidelity, and the move to beat.
- Public submission form for handle, category, signature move, reference clip URL, and proof filename.
- Entry detail pages with verification state, C.O.R.E. verdict, score, and evidence links.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
