# Viral Reel / Cup of Tea — launch readiness

Review date: November 28, 2026. **Not yet approved for full commercial launch.**
The current workspace revision has not been republished.

## Verified in this development pass

- All workspace TypeScript checks pass, including both video projects. No error suppression.
- All four web builds and the API production build pass.
- Dependency audit reports no known vulnerabilities. This is not a full application security certification.
- 117 existing/extended API regression tests pass, including anonymous team-access denial,
  moderation, optional checkout validation, refund handling, private playback, result clearance
  and Printful error handling.
- 15 targeted commission-policy tests pass: $0.96 eligible credit, daily/campaign caps,
  refunded/unverified/test/wrong-price exclusion, approved shirt-profit evidence and explicit
  campaign-window validation.
- Development web/API workflows start successfully.
- Targeted browser integration passed after applying the missing development schema:
  anonymous prompts, verified promoter sign-in, own not-registered status, closed intake,
  no promoter-to-team privilege escalation, sign-out isolation and no 375px page overflow.
  Pending/approved applicant and earnings states were not exercised.
- Official production URL returned by deployment management is `https://sigduel.com`;
  homepage and health endpoint respond successfully.

## Implemented or corrected without changing the existing sports design

- Official show announcement: competition continues through May 2027 Show Week;
  December 7–16, 2026 is only the initial promoter campaign. Exact May dates and
  stage deadlines remain pending. Final Faceoff, verified official announcement,
  Physical Champion Card and the target of 500 owner-approved professional cards are stated.
- Three stages use the owner-confirmed names. An unapproved 1,000-like qualification
  proposal is no longer displayed as the qualification threshold.
- Managed promoter sign-in is separate from team-studio authentication.
  Primary email verification is checked server-side; client bodies cannot choose identity.
- Individual application/status/dashboard routes and account pages are connected.
  Intake, dashboards and commissions retain independent activation gates.
- Owner application verification/approval controls reuse the existing protected endpoints.
  Attestation records a review; it is not automatic age or employment verification.
- Valid public referral codes survive navigation in the same tab and are sent with
  optional checkout. Server validation remains authoritative. Authenticated self-referrals
  are excluded; this alone is not comprehensive anonymous fraud prevention.
- Commission accounting requires explicit owner-configured start/end instants,
  timezone, payout-policy approval and verified live payments before activation.
  Credits use verified base price, not tax-inclusive totals, and campaign-window sums
  rather than lifetime sums for the campaign cap.
- Verified stored payment reads reverse attributed credits when any refund is confirmed.
  Unique payment keys are retained after reversal. Reversed credits are excluded from earnings.
- Existing private merchandise mockups are reachable from owner tools, not public navigation.
- Applied the existing promoter schema to the development database after the browser
  check found the tables missing. Production schema application is left to the managed Publish flow.
- Corrected narrow-screen shared navigation overflow without changing desktop branding.

## Readiness by workflow

| Area | Current result | Required before declaring production-ready |
| --- | --- | --- |
| Stage 1 — Create & Submit | Existing anonymous submission, professional-move attempts, review and private creator access have passing API regressions | Final integrated participant/browser acceptance on the release revision |
| Stage 2 — Signature Move Showdown | Existing free exhibition voting remains; official qualification pages are informational | Owner-approved qualification/voter policy, deadlines and official source integration |
| Stage 3 — Championship Brackets | Existing clearance/correction history works in regressions; bracket pages remain informational | Verified official bracket/qualifier data, advancement rules, final source and owner-approved deadlines |
| Professional athlete library | Five published cards observed from the live API; 500 is a target, not a completed library | Rights/likeness clearance, generation-cost approval and owner review before scaling |
| $2 motion cards | Existing Whop purchase, tax validation, refunds and gated generation regressions pass | Verify live-mode configuration, taxes, return flow and an authorized end-to-end payment/generation/refund check; no new real charge was made |
| Promoter program | New secure individual account paths and owner controls connected; activation remains off | Organization intake approval, work/consent requirements, campaign accounting boundaries/timezone, refund/clawback and payout rules, assisted-sale permissions |
| Commission reliability | Duplicate-key protection, bounded credits and verified-read reversals exist | Fully automated external-refund reconciliation, payout reconciliation and broader identity/fraud controls; never enable payouts based only on browser referral codes |
| Merchandise | Existing catalog/mockup code preserved; private mockup screen connected | Printful store-product request currently returns HTTP 401. Restore access; confirm three synced designs/variants, prices, fulfillment/shipping/tax/returns and checkout payment configuration. Physical checkout is not implemented/live |
| Champion award | Award intent stated correctly | Verified winner, final art, printer/shipping consent and fulfillment approval |
| Email/results | Existing official-result and delivery regressions pass | Confirm production sender/destination, final official result source and permissions. No invitations were sent |
| Domain/authentication | Existing domain serves the sports app; targeted development account test passes. Read-only production schema check confirms the four promoter tables are absent | Publish applies the development schema; verify production authentication proxy and secure cookies on the custom domain, then complete release-specific production acceptance |

## Activation safety

Do not turn on financial or youth-work features simply to remove a warning.
Campaign accounting configuration uses `PROMOTER_CAMPAIGN_START_AT`,
`PROMOTER_CAMPAIGN_END_AT` (exclusive), `PROMOTER_CAMPAIGN_TIMEZONE` and
`PROMOTER_PAYOUT_POLICY_APPROVED`, in addition to the existing independent
registration, attribution, dashboard, commission and live-payment verification gates.
The owner must choose exact instants; no default cutoff was invented.
These settings never close the public competition.

The current dashboard explicitly labels its historical totals as all-recorded credits,
not a final campaign statement. No payout execution is provided by these totals.
Automatic external refund handling, campaign-period statements, assisted-sale checkout
and final payout readiness remain unverified.

## Release boundary

GitHub synchronization is not a production republish. Keep the original design and
working integrations; do not publish paid generation, real fulfillment or payouts merely
because builds pass. Complete the remaining approved configuration, then run the final
integrated release test and have the owner republish. Confirm the newly published revision
on the custom domain before declaring readiness.
