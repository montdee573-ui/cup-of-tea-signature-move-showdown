# Viral Reel

Free movie discovery app for finding legal, free-to-watch films worth sharing, with search, genre filters, watch links, and a personal list.

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

- `artifacts/signature-move-showdown` — React/Vite movie discovery site with curated free titles, search, filters, watch links, and a watchlist.
- `artifacts/api-server` — shared API server; the movie catalog is intentionally client-curated for this first build.

## Architecture decisions

- The first movie catalog uses direct links to free-to-watch source pages rather than copying or redistributing movie files.
- The app does not require an account; saved titles are stored locally in the visitor's browser.
- Availability can vary by region, so every watch action opens the source page instead of promising universal playback.

## Product

- Trending and free-tonight movie rows.
- Genre filtering and title search.
- Movie details with score, description, source link, and save-to-list action.
- Mobile-friendly public browsing without sign-in.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
