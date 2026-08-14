# Required reading before any task in this repo

This workspace (`LINARA`, the web dashboard) is one half of a two-app system
that shares a single Supabase Postgres instance with the
[`LINARA_MOBILE`](../LINARA_MOBILE/README.md) native workspace. Before
implementing, reviewing, or modifying anything here, read:

1. [`plan.md`](plan.md) — product requirements, user roles/permissions, and all step-by-step flows (onboarding handshake, anchor-based appointments, Quick Utos, after-hours ledger, pantry↔palengke reconciliation).
2. [`architecture.md`](architecture.md) — tech stack, component hierarchy, feature-folder conventions, and the full Postgres schema + RLS policies (Section 8) this app owns.
3. [`aiagent.md`](aiagent.md) — system prompts and JSON schemas for the three server-side AI agents (SOP Creator, Temporal Scheduler, Quick Utos Router).
4. [`execution_plan.md`](execution_plan.md) — the authoritative 17-story roadmap and per-story files under [`roadmap/`](roadmap/).
5. [`KNOWN_GAPS.md`](KNOWN_GAPS.md) — shared, cross-repo log of mismatches between the docs/roadmap and what the schema/code actually support. Covers gaps found from either `LINARA` or `LINARA_MOBILE`. Check it before starting a story that might touch a listed gap, and add to it the moment you find a new one — don't silently work around it and let the next session rediscover it.

**Cross-repo context — do not treat this app in isolation:**

- Both apps point at the **same** Supabase project (`SUPABASE_URL` here == `EXPO_PUBLIC_SUPABASE_URL` in `../LINARA_MOBILE/.env`). This app is the schema owner — a change here to a table, column, or RLS policy that `../LINARA_MOBILE` also reads/writes will break the mobile client unless both are updated together.
- `public.helper_notes` is RLS-isolated per helper (the "Privacy Wall") — no code path in either app may let a manager read it.
- This web app is manager-facing (Pass, Board, Money, People, Schedule). The helper-facing Worker's Station lives exclusively in `../LINARA_MOBILE`.
- If `../LINARA_MOBILE/plan.md` or `../LINARA_MOBILE/architecture.md` describe a flow or schema detail that conflicts with this repo's docs, treat this repo as canonical for anything schema-related and flag the discrepancy rather than silently picking one.

**No `app_dev_rules.md` currently exists in this repo** (LINARA_MOBILE has one governing story-by-story execution — pre-existing-context priority, scope discipline, git hygiene, terminology sanitization). If asked to implement a story here, ask the user whether the same rules should apply before assuming so.
