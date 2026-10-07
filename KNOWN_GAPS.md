# Known Gaps

Shared, cross-repo log of mismatches between the docs/roadmap and what the
code and schema actually support. This file lives in `LINARA` because it is
the schema-owning repo, but it covers gaps found from **either** workspace —
`LINARA` (web) or [`LINARA_MOBILE`](../LINARA_MOBILE/README.md).

**Read this before starting a story that touches a gap listed below.**
**Add to this file the moment you find a new gap** — a roadmap step that
assumes a column, table, or behavior that doesn't actually exist, a piece of
UI copy that promises something the schema can't back, etc. Don't silently
work around it and let the next session rediscover it. Use the template at
the bottom.

---

## Open Gaps

### O2. A household can only ever have one admin -- co-manager and remote (OFW) admin have no way in

- **Found:** 2026-09-30, during a launch-readiness review (checking the marketing claims against the code).
- **What's missing:** `plan.md` §1.2, `README.md` §2 and `home-management-concept.md` §9 describe three admin types, with the OFW remote admin called "the killer differentiator". The schema supports them (`user_profiles.user_type IN ('primary_manager','co_manager','remote_admin','helper')`), and the UI for them exists (`remote-glance.tsx`, the suggestions inbox, `ViewAsSwitcher`, the remote branch in `use-send-gate.ts`). But nothing creates a second admin: `use-session.ts` builds `admins` as `admin ? [admin] : []` (just the signed-in user), `updateAdminType` is a `console.warn` stub, and there's no admin invite. The landing page ("Perfect for busy parents or OFW families managing from abroad") promises a mode nobody can reach.
- **Blocks:** Any demo or marketing of OFW mode, multi-admin attribution ("from [name]"), and the remote-suggestion approval flow.
- **Current workaround:** None.
- **Fix, applied 2026-10-03:** `supabase/add-household-managers.sql`, tested in `supabase/tests/household-managers.test.mjs` (in `npm run test:sql`).
  - **Model:** `household_managers` (one row per manager per household, with that household's role, one primary each) and `manager_invites` (8-character single-use codes, 7 days). `user_profiles.household_id` / `user_type` stay the household the account is in right now, so every policy and function that reads them is unchanged; `switch_household()` moves the account between its memberships. One active household per account (user's choice): a switch on one device moves the others, and the web reloads when it notices. A helper account can't be a manager anywhere (separate logins, user's choice).
  - **Roles:** the primary manager invites co-managers and remote admins, changes roles, hands primary over (one primary, user's choice) and removes managers; anyone else can leave. Any manager can start another household (`create_household`). Account deletion now goes through every household the person manages: one with another manager keeps everything and, if they were primary, its longest-standing co-manager takes over.
  - **Enforced in the database** (user's choice), not only in server code: RESTRICTIVE policies keep a remote admin to suggested tasks, or urgent ones while the helper is on shift (never overriding her off-hours), urgent Quick Utos on shift, no appointment / invite-flag / payout-attempt writes; she may approve vales and set the budget (`plan.md`: usually the funding source). Also closes a hole: `payout_attempts_isolation` let a helper's session write payout attempts.
  - **Web** (works before the SQL is applied; the new parts stay hidden until then): household switcher in the top bar (switch, New household, Join with a code), a Managers section on People (roster, invite codes, role, make primary, remove, leave), sign-up and the setup screen can join with a code, the send gate holds a remote admin to the same rules, and the unused `INITIAL_ADMINS` mock and "View as" switcher are gone.
  - **Mobile:** no change needed: `getAccountKind()` only checks that `user_type` is a manager type, and the WebView keeps working through a switch.
- **Verified (2026-10-03):** against the live database, the test manager is the primary of its household (backfill), the functions answer, and `npm run qa` (45 browser checks, incl. the household menu and Managers on People) and `npm run qa:deep` (a code made and cancelled) pass on a local production build.
- **To close:** Deploy the web change, then have a second account claim a code on the deployed site (no second manager test account exists yet), then move this to Closed Gaps. Owned by `LINARA`.

### O18. The mobile app's manager side is the web dashboard in a WebView, not native screens

- **Found:** 2026-10-01. The client wants managers in the APK too. For the demo, `LINARA_MOBILE/app/manager.tsx` loads the deployed dashboard (`MANAGER_DASHBOARD_URL` in `lib/env.ts`, defaulting to `https://linara-delta.vercel.app`) for accounts whose `user_type` is a manager type, and hands the page the app's session. A native rebuild comes later.
- **What's missing:** Native manager screens. `LINARA_MOBILE/AGENTS.md` used to say the mobile client is helper-facing only; that's no longer true.
- **Known limits of the WebView:** no offline use (a retry screen instead); no manager push notifications (`use-push-notifications.ts` skips managers, which is fine today because every push goes to a helper); the page reloads when the app refreshes the token (the page itself leaves renewal to the app there, C75). A manager who signs up on the in-app dashboard but closes it before creating their household has no `user_profiles` row, so on the next launch they land on the helper tabs. Signing in again and choosing "New manager? Set up your household" gets them back. Since C89 the server sends a request for `/manager/*` without the `linara_signed_in` cookie to `/login`, and the app's first request can't carry it (its tokens arrive by injected script, after the response). So the first time a phone opens the dashboard it hops through `/login`, which forwards a signed-in page to the Pass and sets the cookie; after that it opens directly. Sending the cookie with the WebView's first request (`source.headers`) would skip even that.
- **Blocks:** Nothing for the demo. For a native rebuild, the web's `*.actions.ts` are `createServerFn` handlers. Most just wrap `createAuthedClient(token)` and can run on-device under RLS, but the Xendit payout calls use `XENDIT_SECRET_WRITE_KEY` and have to stay server-side.
- **To close:** Rebuild Pass, Schedule, Money, People and Pantry as React Native screens in `LINARA_MOBILE`, or accept the WebView and add offline and push support to it. Owned by `LINARA_MOBILE`, but every web UI change until then ships to the app automatically.

### O24. The web "Hold to record a voice utos" button records nothing

- **Found:** 2026-10-02, while reviewing client feedback ("The voice utos doesn't work").
- **What's missing:** `quick-utos-launcher.tsx` changes the button's style while it's held, then on release sends the fixed text `"🎙️ Voice utos · 0:04"` as a typed utos. There is no `MediaRecorder` or microphone access, and nothing is transcribed. The helper gets that literal string. `LINARA_MOBILE` has real recording and transcription (`use-audio-recorder.ts` → `transcribe-notes`), but only for her private scratchpad. Helpers have no way to send a voice utos at all.
- **Blocks:** Voice utos for managers, on the web and in the APK's WebView (O18). The WebView would also need microphone permission for the page (`react-native-webview` media capture plus Android `RECORD_AUDIO`).
- **Current workaround:** The button is removed (2026-10-02), so Quick Utos is presets and typed text only. Nothing pretends to record.
- **To close:** Record in the browser, send the audio to `transcribe-notes`, then route the transcript through `routeUtosFn` like a typed utos, and put the button back. Transcription returns a canned mock while `USE_MOCK_AI` is on or `OPENAI_API_KEY` is unset, so real voice also depends on the AI-provider decision. Owned by `LINARA`, with the WebView permission in `LINARA_MOBILE`.

---

### O26. Every AI feature answers from a mock; no provider is chosen

- **Found:** 2026-08-14 (first deploy), logged 2026-10-03 when listing what's left after the QA round.
- **What's missing:** `aiagent.md` describes three live agents. All six AI edge functions (`generate-sop`, `simplify-sop`, `parse-scheduler`, `route-utos`, `promote-voice-task`, `transcribe-notes`) read `USE_MOCK_AI` and return canned output when it's `true`, which is how they're deployed. They're coded against OpenAI's request shape (`OPENAI_API_KEY`, `whisper-1` for transcription), and no key is set in the Supabase secrets.
- **Blocks:** Real SOP generation, natural-language scheduling, Quick Utos routing, and voice (O24).
- **Current workaround:** The mocks. The provider (OpenAI, Claude or Gemini) is still open; README §12.4 has the options. `transcribe-notes` needs speech-to-text whichever text model is picked.
- **To close:** Pick a provider, put the calls behind one shared helper in `supabase/functions/_shared/` with the mocks kept as a fallback, set the key as a Supabase Edge Function secret (never Vercel, `VITE_` or `EXPO_PUBLIC_`), and name the provider in the privacy policy (`src/features/legal/privacy-policy.tsx` says nothing is sent to an AI company). Owned by `LINARA`.

### O27. The manager app has no English / Filipino toggle

- **Found:** 2026-09-30 (decided during the design refresh), logged 2026-10-03.
- **What's missing:** `PRODUCT.md` (Capabilities and Constraints; Accessibility) commits to a full English / Filipino toggle for all three manager types. The web copy is English with some Tagalog (toasts, the staff sign-in screen), and there's no i18n layer.
- **Blocks:** Lola / relative managers who'd rather read Filipino; nothing technical.
- **Current workaround:** None.
- **To close:** Pull manager-facing strings into a catalogue, add the toggle, and translate. The helper app (`LINARA_MOBILE`) is already Filipino-first and isn't part of this. Owned by `LINARA`.

### O28. Receipt and task photos were kept forever

- **Found:** 2026-10-02, while adding `grocery_receipts` (C80), logged 2026-10-03.
- **Was:** Task evidence and receipts go to the `household-evidence` bucket (`ARCHITECTURE.md` §5.1), shrunk on the phone to about 150 to 300 KB each, but nothing ever deleted them, and neither the schema nor the docs said how long they should be kept.
- **Decided (team, 2026-10-03; NOT yet approved by the client):** task completion photos are kept **30 days**, receipt photos **60 days** (a palengke run's photo is its receipt, so 60). The amounts that matter outlive the pictures in rows that are never purged: what was bought and what it cost (`grocery_items`), and the task, who did it, when, and its comments. A manager who wants a photo for longer saves it from the web. **Revisit once the client has approved (or changed) these periods** -- they're two constants: `TASK_PHOTO_DAYS` / `RECEIPT_PHOTO_DAYS` in `src/lib/evidence-photo.ts` (UI copy) and the defaults of `release_expired_evidence()` (the actual purge). Wage records are a separate question (RA 10361, `LEGAL_CONSIDERATIONS.md` "Records"); nothing here touches payslips or payout QR codes.
- **Fix, built 2026-10-03, NOT yet applied:**
  - `supabase/add-evidence-photo-retention.sql`: `release_expired_evidence()` picks `<household>/tickets/` files older than 30 days and `<household>/receipts/` files older than 60 by the file's own upload time, nulls `tickets.photo_evidence_url` and deletes the `grocery_receipts` rows pointing at them, and returns the paths. Going by file age also sweeps thumbnails and files no row ever pointed at. Service role only. PGlite: `supabase/tests/evidence-retention.test.mjs` (15 checks).
  - `supabase/functions/purge-expired-evidence`: removes those files through the Storage API (Supabase refuses `DELETE` on `storage.objects` from SQL). Called nightly at 02:30 Manila by the `purge-expired-evidence` pg_cron job via pg_net, authenticated by `x-purge-secret` (`verify_jwt = false`, `config.toml`). A failed removal is picked up again the next night.
  - **Thumbnails** (option B, made on the phone): `LINARA_MOBILE/services/media-upload.ts` also uploads a 480px, 70% JPEG copy at `<name>.thumb.jpg` (about 25 to 45 KB), best effort. The web signs both in one call (`signEvidencePhotos`) and cards, the OFW glance and the receipt list show the thumbnail, falling back to the full photo for older uploads.
  - **Save locally:** the task dialog's photo and the receipt viewer have "Save photo" / "Save receipt", a download of the same signed URL (`savePhotoUrl`, Storage's `download` parameter), and say how long photos are kept. In the APK's manager WebView the link opens the phone's browser, which saves it (`app/manager.tsx` sends non-dashboard URLs out).
- **To close:** apply the SQL above the `@schedule` line; set `EVIDENCE_PURGE_SECRET`, deploy `purge-expired-evidence`, add the two Vault secrets and run the `@schedule` part (all spelled out in the SQL file's comments and `supabase/DEPLOYMENTS.md`); invoke the job once (`SELECT net.http_post(...)` from the schedule, or wait a night) and check `net._http_response` says `released`/`removed`. Build a mobile APK so new photos get thumbnails. Test Save on a phone in the WebView. Then move this to Closed Gaps. Owned by `LINARA` (SQL, function, web) and `LINARA_MOBILE` (thumbnail upload).

### O31. Helpers can't edit a task

- **Found:** 2026-10-02, client feedback, logged 2026-10-03.
- **Was:** In `LINARA_MOBILE` a helper can start, finish, reopen, block and comment on a task (`services/api/tickets.ts`), but not change its title, time or note. Only managers edit, on the web. Separately (C72's residual), `tickets_isolation` was one household-wide `FOR ALL` policy, so her login used straight against the REST API could already change *any* column of *any* task in the house, or delete it.
- **Decided (user, 2026-10-04):** she may change her own task's **time and note**; the title and who it's for stay the manager's.
- **Fix, built 2026-10-04, SQL applied 2026-10-05:**
  - `supabase/add-helper-task-edit.sql`: trigger `tickets_zz_guard_helper_update` lets a helper's session update only her own task, and only `status`, `actual_start` / `actual_end`, `block_reason`, `photo_evidence_url` (what her app already writes) plus `scheduled_start` and `notes`. Never to or from `cancelled`, and not the time or note of a done task (unticking still works). RESTRICTIVE policies: she inserts tasks for herself only ("Promote to Board"), and only managers delete. Managers and `SECURITY DEFINER` functions (employment end, appointment moves, the ledger trigger) are untouched. Checked first: every SQL function that updates `tickets` is a definer, and the app writes no other ticket column. PGlite: `supabase/tests/helper-task-edit.test.mjs` (in `npm run test:sql`).
  - **Rest owed is unaffected:** the ledger trigger (C76) reads `actual_start` / `actual_end` and the after-hours / emergency flags, which she can't set, never `scheduled_start`. The C71 move notice is for *her* when a manager moves her task, so it isn't written when she moves it herself.
  - **Mobile:** "Ayusin ang oras o note" on the focus card (`components/features/today/edit-task-form.tsx`): day and time pickers and the note, online only. A moved time also posts "Inilipat ko sa 4:30 PM (dati 3:00 PM)." to the task's updates, so the manager sees it on the Pass as a comment badge. The card now shows the task's time. `combineLocalDateTime` (`lib/datetime-fields.ts`, tested under three zones) builds the time from parts, never through UTC (C38).
- **To close:** build an APK, and on a phone move a task and change a note; check the manager's Pass shows the new time and the comment. Then move this to Closed Gaps. Owned by both: the guard in `LINARA`, the screen in `LINARA_MOBILE`.

### O33. Staff can't change the grocery budget (waiting on the client)

- **Found:** 2026-10-02, client feedback, logged 2026-10-03.
- **What's missing:** The client asked for staff to edit the budget. The budget is `households.petty_cash_budget` (C13, `add-household-petty-cash-budget.sql`), and C13 left setting it to managers on the web while the app does the shopping, so this reverses that split.
- **Blocks:** Nothing until the client confirms.
- **Current workaround:** A manager sets it on the web.
- **Superseded by O40 (user, 2026-10-06):** budgets are now per run and per month. Staff (pantry leads) draft a run and a manager approves it with the cash, rather than staff editing the budget. Monthly budgets stay manager-set.
- **To close:** Close together with O40 once the client sees the approval flow, unless they still want staff to set budgets.

### O34. A remote admin couldn't pay wages

- **Found:** 2026-10-03, while building O2's manager roles. `plan.md` §1.2 had no row for paying.
- **Decided (client, 2026-10-03):** co-managers manage helpers (`plan.md` and `README.md` split "Manage Admins & Helpers"), and a remote admin pays wages (new "Pay Wages" row: primary, co and remote).
- **Fix, applied 2026-10-03:** `supabase/add-remote-admin-pay.sql`. Every payment goes through `pay_target()` (the GCash / Maya payout via `initiate_payslip`, and "Paid outside Linara"), plus `withdraw_offapp_payslip()`; the SQL reads each one's live definition and adds `remote_admin` to its role list, nothing else, and refuses if that list isn't there. PGlite: `supabase/tests/remote-admin-pay.test.mjs`. Web: Money and Past staff show Pay to every manager role.
- **To close:** Pay as a real remote admin on the deployed site (needs a second manager test account, as O2 does), then move this to Closed Gaps. Owned by `LINARA`.

### O35. Nothing collects the money a payout sends: Linara's own Xendit balance paid every helper

- **Found:** 2026-10-03, when the client asked how linked cards are handled.
- **Was:** No linked cards or any money coming in. `initiatePayoutFn` (`src/features/pay/pay.actions.ts`) sends `POST /v2/payouts` with Linara's single `XENDIT_SECRET_WRITE_KEY`, to the helper's GCash / Maya, from that account's balance; nothing charged the household. In the sandbox that's invisible (test mode doesn't check the balance); with real money Linara would pay every salary itself.
- **Decided (client, 2026-10-03):** Linara shouldn't hold or move money. The household pays her GCash or Maya directly and Linara keeps the record. Xendit stays in the code, off, for the "debit in advance" option written up for the client (charge the household's saved GCash / card a few days before payday, pay out on payday once it settles: GCash settles in 2 calendar days, cards in about a week).
- **Fix, applied 2026-10-03:** `supabase/add-direct-gcash-pay.sql`, tested in `supabase/tests/direct-gcash-pay.test.mjs`.
  - `helper_payout_accounts`: where she wants to be paid, written only by her; managers of a household she works (or worked) in read it. Her QR goes to `payout/<her user id>/` in household-evidence, which only she can write.
  - `record_offapp_payslip` accepts `PH_GCASH` and `PH_PAYMAYA`.
  - **Web:** "Pay by GCash or Maya" (Money, missed periods, past staff) shows the exact amount (`previewPaymentFn`, the payslip's own figure, to the centavo), her number, name and QR, with copy buttons; "I've sent it" records it with the reference number, and she's asked to confirm. Before she saves her own, the invite's number is shown as unconfirmed. "Pay via GCash / Maya" through Xendit is hidden and refused server-side unless `XENDIT_PAYOUTS=on` (`payout-mode.ts`).
  - **Mobile:** My Pay has "Where to send my pay" (GCash or Maya, name, optional QR from her gallery). The existing "Natanggap mo ba?" asks her to confirm.
- **Verified on the deployed site (2026-10-03):** `e2e/deep/pay.spec.ts` (in `npm run qa:deep`): the test helper saves a GCash number through the API, the test manager's Pay screen shows it, "I've sent it" records a `manual` / `PH_GCASH` payslip with `helper_ack` pending and the reference, at exactly the amount shown; then it's withdrawn and the number deleted.
- **Still open:** GCash has no public way to open a send with the amount filled in, so the manager copies the number and amount (or scans her QR). A manager can still type a different number into GCash; the name check on GCash's confirm screen and her "did you receive it?" are the safeguards.
- **To close:** Save a number from the app's "Where to send my pay" on a real phone (the screen hasn't been device-tested), and confirm a payment there, then move this to Closed Gaps. Owned by both: the SQL and web in `LINARA`, the screen in `LINARA_MOBILE`.

### O36. The manager's views fell apart past a handful of staff

- **Found:** 2026-10-05, user request: households with tens or hundreds of staff.
- **Was:** Every staff view was one block per helper with no search, filter or grouping: a lane each on the Pass, a row each on Schedule's By person, a tall card each on People, one flat payroll list on Money. About 8 helper pickers were plain `<select>`s. The Pass's status chip named one helper (`activeHelpers[0]`, the MULTI_HELPER_HANDLING.md pattern), and Shifts said "No one covers Sunday" whenever any two helpers shared a rest day. Pay periods and rest-owed balances were one browser request per helper.
- **Decided (user, 2026-10-05):** a large customer is one estate run as departments; separate properties stay separate households. **Team** (one per helper, what views group by) plus **Labels** (any number, for filtering), both chosen at invite. Helpers see their own team and labels on their Record.
- **Fix, applied 2026-10-05:** `supabase/add-teams-and-labels.sql`, tested in `supabase/tests/teams-and-labels.test.mjs` (in `npm run test:sql`).
  - **Schema:** `household_teams`, `household_labels`, `helper_labels`, `helper_profiles.team_id` (ARCHITECTURE.md §8, 2b). Primary and co-managers write; every manager reads; a helper reads her own labels only and can't change her team.
  - **Web** (`src/features/teams/`; works before the SQL is applied, with teams hidden until it is):
    - **Invite modal:** team and labels, created inline.
    - **People:** search, team and label filters, grouping by team, one-line rows past 8 helpers, "Choose several" to move people to a team or add/remove a label in bulk, and a Teams and labels section.
    - **Pass:** a third layout, **Roll call** (a line per person; the default past 8 active helpers). Line and Roll call group by team under collapsible headers with done/total and "needs you". Lanes needing a decision sort first. The Board filters by scope. "X of Y on shift" replaces the one-helper chip.
    - **Schedule:** the person picker can choose "All of <team>", search narrows by team on the server, and By person groups rows under team headings.
    - **Shifts:** groups by team, and warns only when everyone in a team rests the same day.
    - **Money:** payroll filters, "Still to pay", and per-team subtotals.
    - **Every helper picker** is `HelperPicker`: the plain select for a small household, searchable and grouped by team past 8 helpers or once there are teams.
    - The team/label/grouping choice follows the manager across tabs on that device (`useStaffScope`).
  - **Requests:** pay periods and rest-owed balances are one browser request for the whole staff (`listPayPeriodsForFn`, `getRestOwedBalancesFn`), fanned out on the server 8 at a time.
  - **Mobile:** Record shows "Team" and "Mga label" (`services/api/record.ts`). Before the SQL is applied it shows neither.
- **Still open:** the claim screen (`review-terms.tsx`) doesn't show team or labels, since `lookup` reads them through an RPC that would need changing. Leave balances (`leave.actions.ts`) still run 3 queries per helper on the server. The batched pay reads still call one RPC per helper behind the single request; a set-returning SQL function for the household would remove that.
- **Verified (2026-10-05):** against the live database, the test manager and test staff account both read `household_teams`, `household_labels`, `helper_labels` and `helper_profiles.team_id`, and the staff account is refused creating a team. `npm run qa` (45 browser checks) passes on a local production build against the applied schema.
- **To close:** On the deployed site, make a team and a label from the invite form, invite into them, check People, Pass (Roll call, grouping), Schedule, Shifts and Money with a seeded large household, and see the team and label on the helper's Record on a device. Then move this to Closed Gaps. Owned by `LINARA` (schema, web), with the Record row in `LINARA_MOBILE`.

### O37. Stations are a fixed list of five

- **Found:** 2026-10-05, while building O36.
- **What's missing:** `helper_profiles.station` is CHECK-limited to Yaya, Cook, Laundry, Driver, House. That list is repeated in `people.types.ts`, LINARA_MOBILE's `handshake.ts` / `helper-profile.ts` / `voice-pipeline.ts`, and the Quick Utos Router prompt (`aiagent.md` Agent 3). A large estate's gardeners, guards and maintenance staff have no station.
- **Blocks:** Accurate roles for a large staff, and station-based routing for them.
- **Current workaround (user's choice, 2026-10-05):** keep the five. Teams and labels (O36) carry departments and anything else.
- **To close:** Decide between an "Other" station with a free-text title, or household-defined roles. Either way, change the CHECK, both apps' types and the router prompt together. Owned by `LINARA`.

### O38. A manager can't be limited to one team, and nothing goes to a whole team

- **Found:** 2026-10-05, while building O36. Deferred by the user.
- **What's missing:** Every manager sees and runs the whole household. A department head can narrow their views to their team (the choice is remembered per device), but nothing enforces it. A task or Quick Utos goes to one helper, never to "the Kitchen".
- **Blocks:** Delegating a large estate to department heads; announcements to a team.
- **Current workaround:** The team filter, and sending to each person.
- **To close:** Team-scoped manager rows (a `team_id` on `household_managers`, with RLS on tickets, quick_utos and the rest) and a fan-out for team sends. Owned by `LINARA`.

### O39. A helper could work in only one household, on one team, and tasks had no place

- **Found:** 2026-10-05, user request after O36: staff work across the family's houses ("drive A from House 1 to House 2, then B back").
- **Was:** One ACTIVE employment per helper, and her login reached only that household. A task assigned to her elsewhere was invisible to her, and House 2's managers couldn't see her (no lane, no picker entry). A helper had at most one team. Tasks had no location, and nothing checked that a task's helper worked in the task's household.
- **Decided (user, 2026-10-05):**
  - One employment and one employer: her home household pays her and keeps her record.
  - She also works in other households of the family, where the family is defined by the people who run them: a primary or co-manager can share her into any household they also run. Nothing moves.
  - Home team plus teams she also covers.
  - Every task is at a house; a trip has a from and a to, each a house or a saved place.
  - Her app gets a house switcher, Today across all her houses, a Today layout choice, and a read-only "my team's day" showing who, what, when, where and status only.
- **Fix, built 2026-10-05, SQL applied (confirmed live 2026-10-07):** `supabase/add-shared-staff-and-places.sql`, tested in `supabase/tests/shared-staff-and-places.test.mjs` (in `npm run test:sql`).
  - **Schema:** `helper_households`, `helper_team_covers`, `household_places`, `tickets.from_*/to_*`, `quick_utos.household_id` (ARCHITECTURE.md §8, 2c).
  - **Her login** reaches every house she works in (`my_household_ids()`): her own tasks (update, add), each house's pantry, palengke list and receipts, team names and saved places, and the photo folder in the evidence bucket. Her session stays in her home household, so pay is unchanged.
  - **Other houses' managers** see her through `shared_helpers()`: shift, availability and team there, never pay.
  - **New guards:** `tickets_helper_works_here` (a task's helper must work in its household; this closes the old hole) and `tickets_places_guard` (trip ends stay inside the family).
  - **Web:**
    - **People:** "Teams & houses" on each helper covers team, also-covers, labels and "Also works at". New "Also working here" and Places sections.
    - **Store:** shared staff join `activeHelpers` (lanes, pickers, schedule, send gate). Pay screens use the new `employedHelpers`.
    - **Team filter:** includes people who cover the team.
    - **Tasks:** the task dialogs have "It's a trip" with From/To. Cards show "Main House → School".
  - **Mobile:**
    - **Today:** a house switcher (all houses or one), a "Isa-isa / Listahan / Oras" layout choice, and place tags on tasks.
    - **Photos:** a Done photo goes in its task's house folder.
    - **Realtime:** listens to her other houses.
    - **Team's day:** "Ang team ko ngayon".
    - **Pantry:** pantry, palengke list and receipts are filtered to one house (they would have mixed otherwise).
    - **Record:** lists her houses, teams and teams she covers.
    - **Quick Utos:** name the house they came from.
- **Still open:**
  - My Week doesn't show place tags yet.
  - An SOP from another house's library doesn't show on her focus card: `house_sops` is still home-household only.
  - Board closing is per house, but her app checks only her home house's.
  - Moving someone's employment to a different employer is still end-and-reinvite, by design.
- **Bug found 2026-10-06, after the SQL was applied live:** every read of labels failed with "infinite recursion detected in policy for relation household_labels", so Teams & labels on People stopped loading. Every manager page also logged it as a console error, which fails the browser QA's "loads without errors" checks.
  - **Cause:** this migration's `helper_labels_write` (FOR ALL, so it is also checked on reads) looked up `household_labels`, whose read policy looks up `helper_labels`.
  - **Fix:** `label_household()` and `i_have_label()`, SECURITY DEFINER, now do those lookups. The fix is in the migration itself, and as `supabase/fix-label-policy-recursion.sql` for the live database, which needs it applied.
  - **Test:** the shared-staff PGlite test now reads labels as a manager and as helpers. It reproduced the error before the fix.
- **To close:** Apply the SQL. Share a test helper into a second test household, give her a trip there, and check: the second house's Pass and pickers show her without pay; her phone shows the trip with its place, takes a Done photo the second house's manager can open, switches pantries, and shows the team's day. Then move this to Closed Gaps. Owned by `LINARA` (schema, web), with the screens in `LINARA_MOBILE`.

### O40. The palengke was one list that never closed: no runs, no history, no assignment, one budget

- **Found:** 2026-10-06, user request after O36/O39: the grocery list should scale like the staff views did ("I think we could only see the latest? It needs a history, different staff per list that ties into teams/tags, budget").
- **Was:**
  - **One list per household.** Bought lines stayed on it forever, so the budget bar compared everything ever bought with one ₱1,500 `households.petty_cash_budget`.
  - **No history.** Lines weren't grouped by shopping trip, the app showed only the latest receipt (the web the latest six), and receipt photos go after 60 days (O28).
  - **No assignment.** Every helper saw and bought from the same list; the only control was pantry lead or runner (C77).
- **Decided (user, 2026-10-06):** Modelled on restaurant purchasing (MarketMan, BlueCart), procurement (Procurify) and petty-cash tools.
  - **Runs from a Needed pool.** Pantry lows and "Ubos na" go to a pool. A manager or pantry lead makes a run from it. Closing a run files it in history; anything not bought goes back to the pool.
  - **Money.** Each run records the cash handed over (abono) and the change returned (sukli), so petty cash reconciles. There's also an optional monthly budget for the house and for each team.
  - **Who sees a run.** Its shoppers, its team (people covering that team too), the helper on its linked task, pantry leads and managers.
  - **Extras chosen:** repeat runs, lead drafts with manager approval (this supersedes O33), and a run linked to a task or trip. Price history per item was not chosen.
- **Fix, built 2026-10-06, SQL applied (confirmed live 2026-10-07):** `supabase/add-grocery-runs.sql` (apply after `add-shared-staff-and-places.sql`), tested in `supabase/tests/grocery-runs.test.mjs` (52 checks, in `npm run test:sql`).
  - **Schema:** `grocery_runs`, `grocery_run_shoppers`, `grocery_templates`, `grocery_template_items`, `grocery_budgets`, `grocery_items.run_id`/`bought_at`, `grocery_receipts.run_id` (ARCHITECTURE.md §8, 9b).
  - **Guards:**
    - **Run lifecycle:** draft → pending (a lead asks) → ready (a manager approves and records the cash) → done or cancelled. Leads can't approve or set cash. Anyone who sees a ready run can tick lines, price them, enter the change and close it. Only a manager touches a closed run.
    - **Lines:** nobody buys from a draft, and a bought line stays on its run.
    - **Stamps and release:** `bought_at` is stamped by the database, so it can't be back-dated. Closing a run releases its unbought lines back to the pool.
  - **Visibility:** a RESTRICTIVE policy on `grocery_items` hides lines on runs a helper can't see. The pool stays visible to everyone, as before.
  - **Repeats:** `start_grocery_run()` makes a draft from a repeat. A matching line already in the pool moves onto the run instead of being listed twice.
  - **Web (Pantry, "Grocery list"):** this month against the budgets, with a Budgets dialog. Tabs for Needed (with "Plan a run"), Runs (repeats due soon, then waiting for approval, ready, drafts; team filter), Repeats and History (a month at a time, with search, and each run's balance shown as balanced or short).
    - **Run dialog:** who goes, team, day, linked task, cash, lines, receipts, change back, and the buttons that move the run along.
    - **Elsewhere:** the Money tab's spend card is now this month against the house budget, and a task card carrying a run shows its progress.
    - **Before the SQL is applied** it is the single list it was.
  - **Mobile (Pantry):**
    - **Mga run:** her ready runs, each with its cash bar, checklist, a receipt for that run, and "Tapos na" with the sukli.
    - **Leads:** drafts and runs waiting for approval, with "Ipa-approve", "Bawiin" and "Burahin", plus "Gumawa ng run" from Kailangan.
    - **Kailangan:** the pool. The last five closed runs show under it.
    - **Today:** a card shows "May listahan" when the task carries a run.
- **Fixed after push:** the app's Pantry tab now re-reads runs and lines each time it opens (LINARA_MOBILE `f53e746`). Tabs stay mounted and nothing refetched on focus, so a run approved on the web didn't appear until the app restarted.
- **Still open:**
  - **Pricing:** no price history per item (not chosen), and the run total isn't estimated before shopping.
  - **Notifications:** a manager isn't pushed when a run is waiting for approval (the Runs tab shows a dot), and a shopper isn't pushed when one is ready.
  - **Pickers:** the task picker in the run dialog lists only the board's day.
  - **Budgets:** a team's monthly spend counts only runs for that team. Buying straight from the pool counts toward the house only.
- **To close:**
  1. Apply the SQL. Then, in a test household:
  2. A lead drafts a run on the phone and asks for approval. A manager approves it on the web with cash.
  3. Check that the run shows on the shopper's and her team's phones but not on another helper's.
  4. Tick and price lines, snap a receipt, and close with the change. The web History shows it balanced.
  5. Start a repeat and check that a pooled line moved onto it.
  6. Then move this to Closed Gaps. Owned by `LINARA` (schema, web), with the screens in `LINARA_MOBILE`.

### O41. A second house couldn't see a shared helper's leave, or that she was booked at another house

- **Found:** 2026-10-06, feature audit after O39 and O40.
- **Was:**
  - **Leave and rest off.** Both belong to her home household, which pays her, and their read policies cover only that household's managers. The Beach House's Pass, planner and send gate showed her available on her leave day, with no warning.
  - **Her other house's tasks.** Each house saw only its own tasks for her, so two houses could book her for the same hour.
- **Decided (user, 2026-10-06):** The second house sees that she's away and when she's busy elsewhere, but not the kind of leave, the reason, or the other house's task details.
- **Fix, built 2026-10-06, SQL applied 2026-10-07:** `supabase/add-shared-staff-availability.sql`. Tested in `supabase/tests/shared-staff-and-places.test.mjs` ("Availability"), and `time-off.test.ts`.
  - **`shared_staff_time_off()`:** approved leave (whole days) and rest off (windows) of staff shared into the caller's household. Dates only.
  - **`staff_elsewhere()`:** tasks of anyone who works here, at the family's other houses, in either direction. Time, house and status only.
  - **Web:**
    - The shared time off joins the time-off list as kind `away`, so the Pass status, planner and send gate treat her as off. It reads "on leave" or "off 1:00 PM – 5:00 PM".
    - Lanes and Roll call say "At Main House 2:00 PM, 4:30 PM", or "now" while a task there is in progress.
    - The task dialogs warn when the time is within an hour of a task at another house.
    - Before the SQL is applied, nothing shows.
- **Follow-up, built 2026-10-06, SQL applied 2026-10-07:** `supabase/add-task-length-and-leave-unassign.sql`. Tested in the same PGlite file ("Leave and length"), and in `task.utils.test.ts` and LINARA_MOBILE `lib/format.test.ts`.
  - **Leave clears every house.** `unassign_tasks_for_leave()` runs when leave is approved or recorded with "move her tasks". It moves her open tasks on those days to Unassigned in every house she works in, using each house's own timezone for the day boundaries.
    - **Who can run it:** only a manager of her home household, and only for dates her live leave covers.
    - **The other house:** each moved task gets a comment from the approving manager: "Moved to Unassigned: Rosa is on leave Oct 12 – Oct 14."
    - **The toast** says how many moved here and how many at each other house. Before the SQL is applied it falls back to this house only.
  - **Task length.** `tickets.duration_minutes` is optional, from 5 minutes to 12 hours.
    - **Where it's set:** "How long" in the New and Edit task dialogs.
    - **Where it shows:** as "2:00 PM – 3:30 PM" on task cards, lanes and the planner, and on her phone's focus card and Today list.
    - **Busy:** `staff_elsewhere()` returns the length, so "busy elsewhere" is a real overlap of two windows. A task with no length counts as 30 minutes, and a long task that started earlier still counts.
- **Still open:**
  - **Busy covers yesterday to 14 days out.** A task further ahead gets no warning.
  - **No same-house overlap check.** Two tasks for her at the same time in the same house don't warn.
  - **My Week doesn't show the length** on her phone. It reads a fixed column list, left alone until the SQL was applied; it can be added now.
- **Applied and checked (2026-10-07):** live as the e2e manager, `tickets.duration_minutes` reads, `shared_staff_time_off()` and `staff_elsewhere()` answer (empty: the sandbox has no shared helper with leave or tasks elsewhere), and `unassign_tasks_for_leave()` refuses a helper whose home household isn't the caller's.
- **To close:** In two test households sharing a helper:
  1. Give her tasks at both houses during an upcoming leave, then approve the leave at home with "move her tasks". Check that both houses' tasks are Unassigned and the Beach House task has the comment.
  2. Check that the Beach House's Pass shows her off and its send gate warns.
  3. Give her a two-hour task at one house and try to book her inside that window at the other: the dialog warns.
  4. Then move this to Closed Gaps. Owned by `LINARA`, with the length shown in `LINARA_MOBILE`.

### O43. "Repeat daily" tasks never come back the next day

- **Found:** 2026-10-06, while carrying task length onto repeating tasks.
- **What's wrong:** New task's "Repeat" saves `tickets.recurrence`, but nothing respawns the task. `startNewDay()` (`use-task-board.ts`) spawns from the in-memory `routines` list. Only `addRoutine()` fills that list, and nothing calls it, so it's always empty and no repeating task is ever made again. Older entries (C52 and the rollover work) describe routines respawning, which matched a mock that has since been removed.
- **Blocks:** Any household relying on daily chores showing up each day.
- **To close:** Respawn from the database: for each open or recent ticket with a `recurrence` matching the new day, insert the next instance, carrying the title, note, assignee (or Unassigned if she's off), time, length and trip. Make it idempotent per `routine_id` and date, so two tabs rolling the day don't double it. Owned by `LINARA`.



### O44. The APK can sit on its startup spinner forever on an older phone

- **Found:** 2026-10-06. The preview APK from `4d99858` (LINARA_MOBILE) stayed on a spinner on an older test phone that was already signed in from an earlier build. Earlier builds had worked on the same phone.
- **Ruled out:** Supabase was up and the build had its `EXPO_PUBLIC_*` values. The last three builds installed identical packages, and the live dashboard loaded for the test manager. Nothing on the signed-out route to sign-in changed. The root cause wasn't found: there's no emulator here, and no log from the phone.
- **What's wrong:** On a signed-in launch the app waits, with no time limit, on three things in order: reading the saved session (`supabase.auth.getSession()`), the account kind (`getAccountKind`), and her employments. If any of these stalls instead of failing, the spinner never ends and there's no way back to sign-in. A `getSession()` that rejected also left the spinner up, because nothing ended the loading state.
- **Safety net, built 2026-10-06 (LINARA_MOBILE):**
  - `components/ui/startup-wait.tsx` replaces the startup spinners in `app/index.tsx`, `app/(app)/_layout.tsx` and `app/manager.tsx`. After 12 seconds it offers **Subukan ulit**, which reads the session again and restarts any hanging requests, and **Sign out** (or **Go to sign in**).
  - Sign-out still refuses while actions wait to sync. If signing out itself stalls for 8 seconds, the phone forgets the session locally (`dropSession`).
  - `getSession()` failing now ends the loading state.
- **Still open:** Why it stalled. If `supabase.auth` itself is wedged, signing in again may stall the same way.
- **To close:** On the affected phone, install a build with the safety net and note which button gets her through. Capture `adb logcat` (`ReactNativeJS` plus errors) from launch. Fix the stall it shows, then move this to Closed Gaps. Owned by `LINARA_MOBILE`.

### O42. Some lists still load everything ever, or don't scale to a large staff

- **Found:** 2026-10-06, feature audit after O40.
- **Open:**
  - **Whole-history loads.** Ledger entries, vales, payslips, appointments and leave requests load in full for the whole household on every page open (`ledger.actions.ts`, `pay.actions.ts`, `appointment.actions.ts`, `leave.actions.ts`). At 100 staff that's thousands of rows a year, growing forever, the same problem the grocery list had (O40). The fix is to load the last 12 months and fetch older months on request, as grocery History does.
  - **People page sections that don't scale:** the Leave section draws one block per helper, and Past staff is one long list. Neither has a team filter or search.
  - **Appointment prep tasks** go to the first helper with a matching station, or to `activeHelpers[0]` (`appointments-section.tsx`). With several drivers it's always the same one, even when she's off. They should go to someone available with that station, or stay Unassigned.
- **Blocks:** Nothing yet. The cost grows with staff and time.
- **To close:** Build when chosen; owned by `LINARA`.

### O47. The AI edge functions answered anyone with the public anon key (QA LM-A6)

- **Found:** 2026-10-07, security QA (`feedback_local/feedback.txt`, LM-A6, Critical): a call to `route-utos` with only the anon key, which ships in the site's JS, returned a live OpenAI answer; fifteen in a row all succeeded.
- **Was:** `verify_jwt = true` only checks that a token is validly signed, and the anon key is. None of `route-utos`, `generate-sop`, `parse-scheduler`, `simplify-sop`, `promote-voice-task` or `transcribe-notes` asked who the caller was or limited calls, so anyone could run up the OpenAI bill or use them as a free AI proxy. The web dashboard itself called three of them with the anon key, from server functions (`routeUtosFn`, `generateSopFn`, `parseSchedulerFn`) that took no login, so `/_serverFn` was a second open door.
- **Built 2026-10-07, not deployed:**
  - `supabase/functions/_shared/ai-guard.ts`, called by all six before any work: 401 unless `auth.getUser()` finds a signed-in user, 429 when that user is out of calls.
  - `supabase/add-ai-call-limits.sql`: `take_ai_call()` counts per user, 60 calls an hour to any one function and 300 a day across all. The table can't be read or changed except through the function. PGlite: `supabase/tests/ai-call-limits.test.mjs`. Until it's applied, the functions let signed-in calls through.
  - Web: the three server functions require the manager's session token and send it to the function instead of the anon key. LINARA_MOBILE's `supabase.functions.invoke` already sends the signed-in user's token, so it needs no change.
- **Not urgent while AI is off (checked 2026-10-07):** the project has no `OPENAI_API_KEY` secret, so every function answers from its built-in mock (`useMockAI || !apiKey`); the tester's "buy milk → Yaya" is the mock's answer. Nothing reaches OpenAI or costs anything today. **Do the steps below before adding `OPENAI_API_KEY`.** The web change is safe to ship on its own: the current functions accept the manager's token too.
- **To close, in this order:**
  1. Apply `add-ai-call-limits.sql` by hand.
  2. Deploy the web (merge to `main`). The new web sends the manager's token, which the current functions accept; the old web sends the anon key, which the new functions refuse, so the web goes first.
  3. Deploy the six functions (`npm run deploy:functions`).
  4. Set a hard monthly spend limit on the OpenAI account (only the account owner can).
  5. Retest LM-A6's steps: the anon key alone gets 401. As a signed-in manager, Quick Utos, the SOP generator and the appointment parser still work on the web; in LINARA_MOBILE, voice notes and the SOP cards still work. Owned by `LINARA`.

### O48. No full Content-Security-Policy yet

- **Found:** 2026-10-07, security QA LM-A8 (see C91), which named "a real CSP" as the higher-value header.
- **What's missing:** pages send `Content-Security-Policy: frame-ancestors 'none'` and nothing else, so the browser doesn't restrict where scripts, styles, images or connections may come from.
- **Why not yet:** a working policy has to allow the Supabase project (REST, Auth, Realtime websockets, Storage signed URLs for photos), Google Fonts, `data:`/`blob:` images from the camera and receipt previews, and TanStack Start's inline hydration scripts (a nonce or hash). A wrong one breaks the app quietly, in the LINARA_MOBILE WebView too.
- **To close:** ship it first as `Content-Security-Policy-Report-Only` from `src/lib/security-headers.ts`, run the e2e suite and the app's manager view with the console open, fix what it reports, then switch it to enforcing. Owned by `LINARA`.

## Closed Gaps

Fixed and applied to the shared Supabase database. Kept here so neither repo
re-investigates something already resolved.

> **Environment note (corrected 2026-08-16):** there is exactly **one**
> Supabase project, and it currently holds **sandbox/test data only** — no real
> household is on it yet, and the paired Xendit account is sandbox. Earlier
> entries (and `PAYMENTS_REMEDIATION.md`) described the payout path as "live",
> which was true in the sense that the code path works end to end, but **not**
> in the sense of real money or real kasambahay payroll records. Schema caution
> still applies — it is the only project, and everything here is applied by
> hand — but data caution does not: rows in it are disposable. Revisit this
> note the moment a real household is onboarded, because the retention
> obligations in RA 10361 attach at that point.

### C1. `user_profiles_isolation` (and every household_id policy copying its pattern) caused infinite recursion (Postgres 42P17)

- **Found:** 2026-08-12, while wiring `LINARA_MOBILE`'s storage RLS policy.
- **Root cause:** Every household_id isolation policy resolved "my
  household_id" via a raw subquery against `user_profiles` from inside a
  policy applied to `user_profiles` itself, re-triggering the same policy
  forever.
- **Fixed by:** `LINARA/supabase/fix-household-rls-recursion.sql` — a
  `SECURITY DEFINER` `current_household_id()` function that bypasses RLS
  for its own internal lookup. Also added missing isolation policies for
  `quick_utos`/`vales`/`ledger_entries`/`invite_flags` (SELECT only), which
  had RLS enabled but no policy at all. Applied and verified live.

### C2. The entire invite/claim handshake was non-functional under RLS

- **Found:** 2026-08-13, auditing why C1 was never caught, and tracing the
  invite/claim flow end to end.
- **Root cause (three separate bugs):** (1) `helper_profiles_isolation`
  gave anonymous callers no way to look up an invite by code — a claimant
  has no `auth.uid()`, so `current_household_id()` always resolves `NULL`
  for them. (2) `invite_flags` had no INSERT policy at all. (3) A brand-new
  helper's own first `user_profiles` INSERT hit a bootstrap deadlock:
  Postgres checks a `FOR ALL` policy's `USING` clause as `WITH CHECK` too,
  and that check needs an _existing_ `user_profiles` row to resolve
  `current_household_id()` — which doesn't exist until this very insert
  completes.
- **Fixed by:** `LINARA/supabase/fix-claim-flow-rls-gaps.sql` — three
  `SECURITY DEFINER` RPCs (`lookup_pending_invite`, `flag_invite`,
  `claim_helper_invite`) replacing the direct table calls in
  `people.actions.ts`. Applied and verified live end-to-end.

### C3. No code path created a household's first manager account (the same bootstrap deadlock as C2, for managers)

- **Found:** 2026-08-13, while wiring the manager-side invite UI (which was
  separately found to be fully disconnected from the real backend — see the
  Phase 1 work in `LINARA`'s `people.actions.ts`/`use-session.ts`/
  `use-invites.ts` history for the fix, not a schema bug so no dedicated
  entry here).
- **Fixed by:** `LINARA/supabase/add-manager-bootstrap.sql` — a `households`
  table plus a `bootstrap_manager_household()` `SECURITY DEFINER` RPC
  (same pattern as C2's `claim_helper_invite`). Applied and verified live:
  real signup -> email confirmation -> login -> bootstrap -> invite ->
  real `helper_profiles` row persisted and RLS-scoped correctly.

### C4. CI never ran the test suite it claimed to gate on

- **Found:** 2026-08-13, auditing why C1 went unnoticed for months.
- **Root cause:** `LINARA/.github/workflows/ci.yml`'s `verify` job ran
  prettier/eslint/`tsc`/build only. `bun run test` (Vitest) and
  `bun run test:e2e` (Playwright) were fully configured
  (`LINARA/roadmap/Story_9_5_TestingFrameworkAndE2ESmokeSetup.md`) but never
  invoked in CI, despite that story's acceptance criteria #3 claiming "a
  pull request fails if any unit or smoke tests are broken."
- **Fixed by:** Added Vitest + Playwright steps to `ci.yml`'s `verify` job
  (with a Playwright browser install step first). Also fixed
  `playwright.config.ts`'s `webServer.command`, which was hardcoded to
  `bun run dev` — CI installs via `npm ci`, not bun, so that command would
  have failed the moment it was actually invoked; changed to `npx vite dev`
  so it works under either package manager. Verified locally: both
  `npm run test` and `npm run test:e2e` pass.

### C5. Realtime board channel filtered on a hardcoded `demo-household-id` literal; quick_utos listener read a nonexistent `helper_id` column

- **Found:** 2026-08-13, auditing `LINARA` Story 13 against the live schema.
- **Root cause:** `household-board-channel`'s `postgres_changes` filter in
  `app-store-provider.tsx` was `household_id=eq.demo-household-id` — a
  literal string, not a real household's UUID, so it could never match a
  real row. Separately, `quick-utos-channel`'s listener checked
  `payload.new.helper_id`, but `quick_utos`'s actual FK column
  (`LINARA/architecture.md`) is `recipient_id`.
- **Fixed by:** The board channel's `postgres_changes` listener now only
  registers (with a real `household_id=eq.${session.householdId}` filter)
  once a manager is signed in; skipped entirely otherwise, since there's no
  real household to filter by yet. The quick_utos listener now reads
  `recipient_id`. Note this doesn't fully close gap #6 — see that entry for
  why the comparison still can't match real data until real helper auth
  exists — and it doesn't touch gap #4/#5/#7's core problem (nothing writes
  to `tickets`/`ledger_entries`/`vales`/`appointments` yet either), only the
  listener-side bugs.

### C6. `helper_profiles` couldn't represent the Shifts UI it was supposed to back

- **Found:** 2026-08-13, auditing `LINARA` Stories 8/9 against the live schema.
- **Root cause:** `helper_profiles` models one fixed shift window
  (`shift_start`/`shift_end`), one `daily_break_duration` (a duration, not a
  window), and exactly one `weekly_rest_day` per helper. The mock
  `useSchedules()`/`WeekSchedule` UI modeled something structurally richer:
  an independent `DaySchedule` per weekday, multiple `segments` per day
  (split shifts), and optional per-day `breakStart`/`breakEnd`. Checked
  `plan.md`: it only ever specifies "Shift Start/End, Weekly Rest Day" per
  helper, matching the schema exactly — the richer per-day/split-shift UI
  was prototype scope creep, not a product requirement.
- **Fixed by:** Simplified the Shifts feature (types, `use-schedules.ts`,
  `shifts-section.tsx`, `my-week-card.tsx`) down to one shift window + one
  rest day per helper, derived from the same `helper_profiles` fetch
  `useInvites` already does for the People roster (no second Supabase
  round-trip) and writable via a new `updateHelperScheduleFn`. One thing
  plan.md _does_ require that the schema didn't support: its After-Hours
  Friction Gating section lists "on a break" as a friction trigger, which
  needs a real break _window_ (not just a duration) to know when during the
  day it happens — `LINARA/supabase/add-shift-break-columns.sql` adds
  `break_start`/`break_end` (one window per helper, same simplification) so
  the Ledger's `rest_break` classification and Availability's on-shift
  check keep working exactly as before, just reshaped. Applied and verified
  live: a real `helper_profiles` UPDATE (shift/rest-day/break) persists and
  survives a fresh, independent read.
- **Known residual limitation, not closed by this fix:** Both `use-ledger.ts`
  and `use-availability.ts` are still hardcoded to look up the schedule for
  `"rosa"` (the mock first-class-device persona) rather than a real signed-in
  helper's id, so `schedules.scheduleFor("rosa")` resolves to `undefined`
  against real data until real helper auth exists. Both hooks and
  `MyWeekCard` handle that `undefined` case gracefully (no crash, no
  incorrect classification), but this is real, separate, larger scope.

### C7. `house_sops` had columns for structured SOPs but no manager-facing flow that wrote to them

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 7 (Today tab
  SOP carousel). Schema half (columns) closed same day by
  `LINARA/supabase/add-house-sops-columns.sql`.
- **Root cause:** The AI SOP Creator edge function (`generate-sop`, web
  Story 10) already returned a structured `HouseStandardSOP` — `title`,
  `description`, `station`, `steps: string[]`, `toolsRequired: string[]`,
  `safetyProtocol` — see `LINARA/src/features/tasks/task.actions.ts`'s
  `generateSopFn`. `NewRoutineModal`'s "Generate SOP with AI" button called
  it, but only flattened the result into a local `note` string for the
  (still-local-only) Routine mock — nothing ever inserted the structured
  result into `house_sops`.
- **Fixed by:** `insertHouseSopFn` in `task.actions.ts` — an authed insert
  following the same pattern as `people.actions.ts`'s `inviteHelperFn`
  (verify token → look up caller's `user_profiles` row for `household_id` +
  manager role → insert). `NewRoutineModal` now keeps the generated
  `HouseStandardSOP` object in state (not just the flattened note string)
  and shows a "Save to Library" action once a manager is signed in; editing
  the title or note afterward invalidates the preview so a manager can't
  save stale data that no longer matches what's on screen.
  `RoutinesView`/`ManagerSchedulePage` thread `session.token` down to power
  it. Note this does not add a dedicated "House Standards Library" list/browse
  page — `plan.md` doesn't describe one, and the manager-facing surface it
  does describe (the SOP generator inside routine creation) is what this
  wires up.
- **Verification:** `tsc --noEmit`, `eslint` on touched files, and the
  existing Vitest suite all pass. Not yet verified against a live signed-in
  manager session end-to-end (no test harness for that flow exists yet) —
  the RLS insert path mirrors `inviteHelperFn`'s already-verified pattern.
- **Known residual limitation, not closed by this fix:** `house_sops` rows
  aren't linked back to anything — `Routine`/`Task` have no `sopId` field
  and nothing writes to `tickets` yet either (gap #4), so a saved SOP
  doesn't yet show up anywhere in this app's own UI after saving; it exists
  purely so `LINARA_MOBILE` (gap consumer) can read real structured data.
  `LINARA_MOBILE`'s `lib/sop.ts` workaround (splitting `description` on
  newlines) hasn't been updated to prefer the new `steps` column — that's a
  separate `LINARA_MOBILE`-side change, not made this session.

### C8. The entire web app read helper identity from a hardcoded 3-person mock roster, disconnected from real `helper_profiles`

- **Found:** 2026-08-13, while scoping gap #5 (Ledger/Vales real inserts).
  `ledger_entries.helper_id`/`vales.helper_id` are `NOT NULL` foreign keys
  into `helper_profiles`, but `useLedger`/`useVales`/`useUtos` all keyed off
  `currentHelperId = "rosa"` (`app-store-provider.tsx`) and a hardcoded
  `HELPERS: Helper[]` constant (`people.constants.ts`, ids `"rosa"`/
  `"manuel"`/`"lita"`) — not a real UUID, so a literal insert would have
  failed the FK constraint outright. Tracing every usage (18 files) showed
  the mock roster was load-bearing well beyond Ledger/Vales: Pass board's
  "Line" view lanes (`manager-pass-tab.tsx`), Routines/Tasks/Appointments
  assignment dropdowns, every board card's helper lookup, and seed demo data
  (`task.constants.ts`'s `INITIAL_TASKS`/`INITIAL_ROUTINES`,
  `appointment.constants.ts`'s `SEED_PREP`/`INITIAL_PREP_TASKS`) all
  hardcoded against the same three fake ids.
- **Root cause:** The mock roster predates any real `helper_profiles` data
  existing at all (this whole app was a local-only prototype originally).
  Once People/Shifts started reading real `helper_profiles` rows (via
  `useInvites`), nothing else in the app was ever migrated off the parallel
  mock — the two data sources coexisted, with most of the UI still on the
  fake one.
- **Fixed by:** `people.utils.ts` gained `toHelper(row: HelperProfileRow):
Helper` (mapping a real row to the display-shaped `Helper` type) and
  `findHelper(id, helpers)` (an id → `Helper` lookup with an "Unknown
  helper" fallback instead of the old lookup's non-null assertion, since a
  miss is now a real possibility — e.g. a deleted profile — not just a
  programmer error). `HELPERS`/`helperById` are deleted. `AppStores` gained
  `helpers: Helper[]` (every real row, any status, for lookups) and
  `activeHelpers: Helper[]` (`status === "ACTIVE"` only, for assignment
  dropdowns and lane rendering); `helper: Helper` became `helper: Helper |
null` — the first ACTIVE helper stands in for "the one with a first-class
  device" (still no real per-helper auth session — that's separate, larger
  scope, same as this file's older "gap #3" note). `currentHelperId`
  (`app-store-provider.tsx`) is now that helper's real UUID, or `null`.
  `useLedger`/`useAvailability`/`useUtos`/`useTaskBoard`/`useAppointments`
  all take real data as parameters instead of importing the mock. Every
  consuming component (~18 files: Pass board lanes, Routines/Tasks/
  Appointments modals and dropdowns, board/suggestion/vale cards, the
  helper's own Worker's Station shell) was updated to source helper data
  from real `helper_profiles` via props threaded from whichever ancestor
  already calls `useAppStores()`, matching the prop-driven pattern already
  used elsewhere in this codebase (no new context dependencies added to leaf
  components). Pages that render a `Helper`-typed value with no sensible
  empty-state fallback (`PayRecordPage`, `HelperShell`, `HelperTodayPage`)
  gate on `helper` being non-null and show a placeholder instead; everywhere
  else a null `helper` degrades to a fallback display string ("your
  helper"). Appointment templates (`EVENT_TEMPLATES`) now key prep rows by
  `station` instead of a specific helper id, resolved to a real active
  helper when a template is applied — station-based templates are portable
  across households, unlike ones hardcoded to specific named people. The
  seed demo data that couldn't be reshaped this way (`INITIAL_TASKS`/
  `INITIAL_ROUTINES`/`INITIAL_PREP_TASKS`/the one seeded `INITIAL_APPOINTMENTS`
  row) was deleted outright rather than left dangling — a fresh household's
  board/routines/appointments now start empty, same as People/Shifts already
  did with no seed data of their own.
- **Verification:** `tsc --noEmit`, `eslint` (project-wide — only
  pre-existing warnings unrelated to this change remain), the Vitest suite,
  and a full `vite build` (SSR + client) all pass clean.
- **Known residual limitation, not closed by this fix:** This closes the
  _identity_ half of gaps #5 and #6 (a real helper id now exists to write),
  not the _insert_ half — `ledger_entries`/`vales`/`quick_utos` still have no
  writer; see those entries. There is still no real per-helper auth session
  (the "first ACTIVE helper" stand-in is a simplification, same posture as
  the residual limitation already noted on C6) — until that exists, a
  household with more than one ACTIVE helper will have every helper-scoped
  feature (Ledger, Availability, Quick Utos, the Worker's Station) act on
  whichever helper happens to be first, not a specific signed-in one.

### C9. Vales (`vales`) was never actually written to (Vales half of former gap #5)

- **Found/Fixed:** 2026-08-13, same session as C8. Unlike `ledger_entries`
  (see C10), `ValeRequest { id, helperId, amount, reason, status }` maps
  onto the `vales` table almost exactly — no mapping decisions needed, so
  this half was safe to close immediately.
- **Fixed by:** New `LINARA/src/features/ledger/ledger.actions.ts` —
  `listValesFn` (authed select, scoped by `vales_isolation`'s join through
  `helper_profiles`, same pattern as `listHelperProfilesFn`), `insertValeFn`
  (authed insert; no extra role check beyond what RLS already enforces,
  since either a manager or a claimed helper's own token may legitimately
  request one), and `decideValeFn` (authed update, gated to
  `primary_manager`/`co_manager` — same guard pattern as `inviteHelperFn`,
  since approving/declining is a manager-only action). `use-vales.ts` now
  fetches on mount/token-change and refetches after every write, matching
  `useSchedules`' "write, then pull the fresh row back" convention. Errors
  are caught and toasted inside the hook itself rather than left to
  callers, since both `ValeRequestModal` and the approve/decline buttons in
  `NeedsYou` call `request`/`decide` as plain fire-and-forget handlers with
  no `await` — matching the UX they already had as pure local state.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. Not yet verified against a live signed-in
  session end-to-end.
- **Known residual limitation, not closed by this fix:** This web app has
  no functioning helper-auth session — `useSession` (`use-session.ts`) is
  manager-only, and `claim-account-flow.tsx` writes a `linara_helper_token`
  to `localStorage` on claim that nothing anywhere reads back (a
  pre-existing dead code path, not introduced by this fix). So
  `vales.request()`, even though it's rendered on the vestigial helper-facing
  `PayRecordPage` (see AGENTS.md — the real Worker's Station lives in
  `LINARA_MOBILE`), always authenticates with whatever session token
  `AppStoreProvider` carries — today, always a manager's. RLS permits this
  (household-scoped, not caller-identity-scoped), but it means a request
  submitted from this web app is never really "the helper's own" the way a
  request from `LINARA_MOBILE` (which owns real helper auth) would be.

### C10. Ledger (`ledger_entries`) was never actually written to (Ledger half of former gap #5)

- **Found:** 2026-08-13, while scoping the Ledger half of gap #5 after C8/C9
  closed the identity problem and Vales respectively. Unlike Vales, the
  client `LedgerEntry` type and the `ledger_entries` table had three real
  mismatches, scoped with the user before writing any code:
  1. `AfterHoursLedger` displays each entry's `title` and a `kind === "utos"`
     badge, but the table had no columns for either — only
     `associated_ticket_id`, useless until gap #4 (`tickets`) is real.
  2. Client `reason` (5 values) vs. table `source_type` (4 values, CHECK
     constraint) — `available`/`override` had no matching value.
  3. Client `resolution` (always set) vs. table `resolved: boolean` +
     nullable `resolution_type` — "resolved" has no defined product meaning
     anywhere in `plan.md`/`architecture.md`.
- **Decisions (user-confirmed):** (1) add the missing columns rather than
  wait on gap #4 or drop the fields — a ledger entry is a historical record,
  so denormalizing `title`/`kind` onto the row is arguably the _correct_
  design regardless of tickets, not just a stopgap: a live join to a
  (someday-editable) ticket title would let history drift, where a snapshot
  won't. `station`/`appointment_title` were **not** added — nothing in
  `AfterHoursLedger` actually renders them today, so there was nothing to
  denormalize yet. (2) `available`/`override` both collapse to
  `source_type = "overtime"`. (3) "resolved" is treated as a no-op:
  every insert sets `resolved = true` immediately, matching the UI's total
  lack of an unresolved state.
- **Fixed by:** `LINARA/supabase/add-ledger-entry-context-columns.sql` adds
  `title`, `kind`, and `adjust_minutes` (duration_minutes is read as the
  auto-computed base; adjust_minutes holds a manager's manual delta on top,
  matching `LedgerEntry.autoMinutes`/`.adjustMinutes`). `ledger.actions.ts`
  gained `listLedgerEntriesFn`/`insertLedgerEntryFn`/`updateLedgerEntryFn`
  plus the reason↔source_type and resolution↔resolution_type mapping
  tables (the reverse `source_type -> reason` mapping is lossy for
  `"overtime"` — both `available` and `override` collapse to it, so a
  reloaded entry can't tell them apart again; `"override"` was picked as
  the reverse value since both already render the same generic "After
  shift" badge via `reasonLabel()`). `doneTsIso` is passed explicitly on
  insert rather than left to the DB's `NOW()` default, since the app clock
  can run on a simulated offset (`use-sim-clock.ts`) that may not match the
  server's real time; `startTs` isn't stored at all — it's reconstructed on
  read as `created_at - duration_minutes` (exact, since duration_minutes is
  literally that difference at insert time). `use-ledger.ts` now fetches on
  mount/token-change and refetches after `record()`/`updateEntry()`, same
  "write then refresh" pattern as C9; errors are caught and toasted inside
  the hook for the same fire-and-forget-caller reason as C9.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. The migration has been applied to the live
  Supabase project (confirmed 2026-08-13). Not yet verified against a live
  signed-in session end-to-end.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9 — `record()` always writes as whatever session token
  `AppStoreProvider` carries (today, always a manager's), not a genuinely
  separate helper identity. And per the decision above, a reloaded entry's
  `reason` can no longer distinguish "available" from "override" — both
  read back as `override`.

### C11. Quick Utos (`quick_utos`) was never actually written to (former gap #6)

- **Found:** 2026-08-13, auditing `LINARA` Stories 11/13 against the live
  schema. The AI classifier (`route-utos` edge function / `routeUtosFn`) was
  real and correctly wired, but its classified result only ever called
  `use-utos.ts`'s local `send()`, never an insert into `quick_utos`. The
  `currentHelperId` identity blocker this entry originally flagged was
  resolved by C8; `QuickUtos { id, content, from, to, timestamp, ackState,
afterHours, emergency, waiting }` turned out to map onto the table almost
  exactly (same as Vales, not like Ledger) — no mapping decisions needed.
- **Also found while closing this:** `use-send-gate.ts` — the layer between
  the send UI and `useUtos.send()` — had two more hardcoded `"rosa"`
  literals (`routeUtosFn`'s `helperId` param, and the off-shift task-gating
  check) that C8's file-by-file rewire missed, since that earlier pass
  grepped for `HELPERS`/`helperById` and this file used neither — it just
  hardcoded the literal string inline. Fixed alongside this gap: `useSendGate`
  now takes `currentHelperId: string | null` from its callers
  (`manager-schedule-page.tsx`/`manager-pass-page.tsx`, both already have
  `helper?.id` from C8's context additions).
- **Fixed by:** `utos.actions.ts` gained `listUtosFn`/`insertUtoFn`/
  `ackUtoFn`/`clearUtosForHelperFn`. `clearUtosForHelperFn` is a real
  `DELETE`, not a soft-clear — `utos.types.ts`'s own doc comment already
  said quick utos are "deliberately ephemeral... `clearForNewDay` genuinely
  deletes them," so this matches existing documented intent rather than
  introducing new behavior. `use-utos.ts` now fetches on mount/token-change
  and refetches after every write, same pattern as C9/C10 — **but this one
  also removes** the old broadcast-based `onAction`/`receiveAction`
  plumbing entirely, rather than layering real writes underneath it. Reason:
  once `send()` genuinely inserts a row, the sender's own optimistic local
  copy (a fake `u${Date.now()}` id) and the row Postgres Realtime delivers
  back (the real id) are not recognizable as the same entry — they'd both
  render, showing every sent utos twice on the sending device. Removing the
  broadcast path and relying solely on `write → refetch` (for the sender)
  plus a broadened Realtime listener (for everyone else) avoids this by
  construction. The `quick-utos-channel` listener in
  `app-store-provider.tsx` changed from `event: "INSERT"` (hand-reconstructing
  a `QuickUtos` from the raw payload, and comparing `recipient_id` client-side)
  to `event: "*"` with a server-side `recipient_id=eq.${currentHelperId}`
  filter that just triggers `utos.refresh()` — simpler, and now also catches
  `ack()`/`clearForNewDay()` changes, which the old INSERT-only listener
  never covered regardless of broadcast.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. Not yet verified against a live signed-in
  session end-to-end.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9/C10 — sends/acks always authenticate as whatever session
  token `AppStoreProvider` carries (today, always a manager's).

### C12. Pass board (`tickets`) was never actually written to (former gap #4)

- **Found:** 2026-08-13, auditing `LINARA` Stories 8/13/14 against the live
  schema. `use-task-board.ts` was pure local `useState`; the offline queue
  only replayed into that same local state; the `household-board-channel`
  Realtime subscription logged incoming `postgres_changes` on `tickets` but
  never applied them. No code path anywhere inserted, updated, or read a
  real `tickets` row.
- **Decisions (user-confirmed before writing code, same as C10's approach):**
  1. **Field mapping** — denormalize every client `Task` field with no table
     equivalent directly onto `tickets` (`block_reason`, `emergency`,
     `suggested`, `queued`, `queued_for_shift`, `recurrence`, `routine_id`,
     `appointment_id`, `appointment_title`, `lead_minutes`,
     `reschedule_notice` — see `supabase/add-ticket-board-columns.sql`),
     same reasoning as C10's `title`/`kind` on `ledger_entries`. `station`
     and `scheduled_date` were deliberately _not_ added: `station` was
     already always derived live from the assigned helper at every call
     site (never independently set, confirmed by tracing every mutator), so
     a column would only reintroduce a staleness bug that behavior never
     actually had; `scheduled_date` is just the date component of the new
     `scheduled_start` timestamp, extracted client-side for
     appointment-linked tickets only.
  2. **Realtime** — `household-board-channel`'s `postgres_changes` listener
     now triggers a plain refetch on any event, mirroring Closed Gap C11's
     `quick-utos-channel` fix exactly. The old broadcast-based
     `board-action` tab-sync channel (`onAction`/`receiveAction` in
     `use-task-board.ts`) is removed entirely, for the same reason C11
     dropped quick utos' broadcast path: once writes are real, keeping both
     an optimistic local copy and a Realtime-delivered copy risks the same
     edit being applied twice.
  3. **Routines** — `Routine` templates stay local-only `useState` (no real
     `routines` table this pass); only the _spawned_ `Task` instances become
     real `tickets` rows, carrying `routine_id` as plain TEXT provenance
     (not a FK, since there's nothing to reference yet).
  4. **Appointments overlap** — also partially resolved gap #7's prep-task
     half: `useAppointments`' `add`/`remove`/`update` now write real
     `tickets` rows for prep tasks (via new `insertPrepTicketsFn`/
     `deleteTicketsByAppointmentFn`/`rescheduleAppointmentTicketsFn`), since
     leaving them as local-only `setTasks` injections would make them vanish
     the next time anything else triggered the board's refetch. The
     `appointments` calendar-event table itself, and an atomic RPC across
     both tables, stay open — see gap #7's narrowed writeup.
- **Fixed by:** `supabase/add-ticket-board-columns.sql` (11 new columns +
  1 index, decisions above). `LINARA/src/features/tasks/task.actions.ts`
  gained `listTicketsFn`/`insertTicketFn`/`updateTicketFn`/`deleteTicketFn`/
  `openQueuedTicketsFn` (bulk-clears `queued` when the board reopens) plus
  three appointment-prep bulk functions. `use-task-board.ts` was rewritten
  end to end: `tasks` is now server-fetched state (`listTicketsFn`, filtered
  to `status != 'done' OR scheduled_start >= <today>` — see below), every
  mutator (`addTask`/`updateStatus`/`blockTask`/`rescheduleTask`/
  `approveSuggestion`/`dismissSuggestion`/`setClosed`) writes through and
  refetches, same "write then refresh" pattern as C9/C10/C11.
  `startNewDay` no longer filters/keeps/drops tasks in local memory — that
  job moved into `listTicketsFn`'s query itself (see below) — it now only
  advances `simDate` and inserts fresh `tickets` rows for routines matching
  the new weekday that don't already have a live instance. The offline queue
  (`lib/offline-queue.ts`) is unchanged; `app-store-provider.tsx`'s
  `syncOfflineQueue` now replays a queued status change by calling the real
  `board.updateStatus()` (which takes the online write-then-refetch path
  once back online) instead of hand-patching local state and manually
  clearing `pendingSync` — the refetch does that for free, since a
  server-fetched `Task` never has a `pendingSync` field to begin with.
  `use-appointments.ts` and `app-store-provider.tsx`'s Realtime/offline
  wiring were updated to match, per decisions 2 and 4 above.
- **Deliberate behavior change (not a regression):** the old local-only
  `startNewDay` silently dropped any unfinished one-off task (no
  `routineId`/`appointmentId`) the moment the simulated day rolled, even if
  it was still `todo` or `blocked`. `listTicketsFn`'s filter no longer does
  this — any not-done ticket stays visible regardless of age; only _done_
  tickets roll off the board once their day passes. Silently losing track of
  unfinished work seemed like the wrong default once the data is real and
  persistent rather than a discardable in-memory array.
- **Verification:** `tsc --noEmit`, `eslint` (project-wide — only
  pre-existing warnings unrelated to this change remain), the Vitest suite,
  and a full `vite build` all pass clean. This session had no service-role
  key or database connection string available (only `SUPABASE_ANON_KEY` in
  `.env`), so `supabase/add-ticket-board-columns.sql` was applied by the user
  directly (e.g. via the Supabase Studio SQL editor) rather than by this
  session — confirmed live 2026-08-13 with an unauthenticated PostgREST
  `select` naming all 11 new columns against the real `tickets` table
  (`GET .../rest/v1/tickets?select=id,block_reason,emergency,...`): a
  `200 []` response, not PostgREST's "column does not exist" 400, which
  confirms column existence independent of RLS row-filtering. Not yet
  verified against a live signed-in session end-to-end, same posture as
  C9–C11.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9–C11 — writes always authenticate as whatever session token
  `AppStoreProvider` carries (today, always a manager's). `boardClosed` (the
  household's "is the board closed for the night" toggle) stays local-only
  UI state, not persisted anywhere — only the per-ticket `queued` flag it
  drives is real now, so a page refresh resets the toggle's visible state
  (though queued tickets themselves stay correctly queued). Real photo
  upload is still a mock (`next-task-card.tsx`'s `PHOTO_POOL` random-pick
  stand-in) — `photo_evidence_url` now persists whatever string that mock
  produces, but nothing uploads an actual photo file anywhere. Gap #7's
  `appointments` table and atomic-write RPC remain open, narrowed per above.

### C13. Grocery petty-cash budget had no shared column, and `LINARA`'s web-side Palengke checklist duplicated helper-only execution work that belongs to `LINARA_MOBILE` (former gap #2)

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 8. **Rescoped:**
  2026-08-13, revisiting after Closed Gap C12 made `tickets` real — auditing
  what `LINARA` actually does with groceries turned up a bigger problem than
  the original gap text: `LINARA`'s `PalengkeInlineList`/`GroceryModal`
  (check off items, enter cost, attach a mock receipt) were reachable from
  this repo's vestigial helper-facing surface (`next-task-card.tsx`), fully
  duplicating shopping-execution actions `LINARA_MOBILE` already performs
  for real — against `AGENTS.md`'s explicit division (helper work lives
  exclusively in `LINARA_MOBILE`). Worse: the _manager_-facing Pantry page
  (`GrocerySection`) had the exact same interactive toggle/cost/receipt UI,
  and the manager Money tab's Spend Dial (`use-grocery-list.ts`) was pure
  local `useState` — meaning a manager's "₱1,120 of ₱1,500 spent" reading
  was never connected to `LINARA_MOBILE`'s real `grocery_items` writes at
  all, even though those real purchases were genuinely happening.
- **Decisions (user-confirmed before writing code):**
  1. Remove the interactive checklist (toggle bought / enter cost / attach
     receipt) from `LINARA` entirely, on both the vestigial helper surface
     and the manager Pantry page — not just leave it inert. Shopping
     execution is `LINARA_MOBILE`'s job; `LINARA` should only curate the
     planned list (add/remove not-yet-bought items) and observe real state.
  2. The manager's Spend Dial should read real `grocery_items` data instead
     of local state, in scope for this pass (not deferred).
  3. Petty-cash budget: one household-level default (not per-run — neither
     app models a "run" as a discrete entity to hang a per-run amount off
     of), manager-writable from `LINARA`, read by both apps.
- **Fixed by:**
  - `supabase/add-household-petty-cash-budget.sql` adds
    `households.petty_cash_budget` (default 1500) plus a household-scoped
    `UPDATE` policy (`households` previously had none at all beyond its
    bootstrap `INSERT`, since only `bootstrap_manager_household()` wrote to
    it before).
  - New `src/features/groceries/grocery.actions.ts`: `listGroceryItemsFn`
    (real read of `grocery_items`), `insertGroceryItemFn`/`deleteGroceryItemFn`
    (list curation only — always `bought: false`, never touches `bought`/
    `actual_cost`), `getHouseholdBudgetFn`/`updateHouseholdBudgetFn` (the
    latter manager-only, same role-check pattern as `insertHouseSopFn`/
    `decideValeFn` — `households`' RLS is household-scoped only, not
    role-aware, matching how every other role restriction in this app is
    enforced in the server function rather than in the policy).
  - `use-grocery-list.ts` rewritten to fetch on mount/token-change and
    refetch after every write, same "write then refresh" pattern as
    C9–C12. `receiptPhoto` is **not** fetched by this hook at all — it's
    threaded in from `app-store-provider.tsx` as
    `board.tasks.find(isPalengke)?.photo`, since a receipt lives on
    `tickets.photo_evidence_url` (already real via C12), not on any
    `grocery_items` row.
  - `toggleBought`/`setCost`/`attachReceipt`/`clearReceipt`/`openModal`
    removed from `GroceryContextValue` entirely. Deleted:
    `grocery-modal.tsx`, `palengke-inline-list.tsx` (the vestigial
    execution UI), `todays-spend-dial.tsx` and `grocery.constants.ts`
    (both already-dead code, confirmed zero importers before deleting).
    `grocery-row.tsx`/`receipt-slot.tsx` simplified to read-only display.
    `grocery-section.tsx` keeps only the add-item form and budget input as
    real writes. `palengke-chip.tsx` now `Link`s to `/manager/pantry` (or
    `/helper/pantry`, via a new `to` prop) instead of opening the removed
    modal.
  - Small related fix: `board-task-card.tsx` (the manager board's actual
    "Done" card) never rendered `task.photo` at all — only `task-card.tsx`
    (used solely for the "queued for tomorrow" list) did. Added a
    toggleable photo view to `board-task-card.tsx` too, since plan.md 3.2
    explicitly describes the manager viewing the receipt "directly on the
    Done card."
- **Verification:** `tsc --noEmit`, `eslint` (project-wide — only the same
  pre-existing warning noted in C12 remains), the Vitest suite, and a full
  `vite build` all pass clean. `supabase/add-household-petty-cash-budget.sql`
  was applied by the user directly (same no-service-role-key posture as
  C12) — confirmed live 2026-08-13 with an unauthenticated PostgREST
  `select id,petty_cash_budget` against the real `households` table: a
  `200 []` response, not a "column does not exist" 400. Not yet verified
  against a live signed-in session end-to-end.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9–C12 applies to `insertGroceryItemFn`/`deleteGroceryItemFn`/
  `updateHouseholdBudgetFn`.
- **`LINARA_MOBILE` half closed:** 2026-08-14 — `use-palengke-budget.ts` now
  reads `households.petty_cash_budget` directly (real, read-only; its old
  AsyncStorage-backed value could silently disagree with the manager's real
  allocation). `services/api/household.ts` added; `BudgetBar`'s tap-to-edit
  affordance is now conditional on an `onChangeBudget` prop, which mobile's
  Pantry screen no longer passes — the budget stays manager-only, set from
  the web dashboard, matching the migration's own "LINARA (manager-writable)
  and LINARA_MOBILE (read-only)" comment.

### C14. Appointments (`appointments`) was never actually written to (former gap #7)

- **Found:** 2026-08-13, auditing `LINARA` Story 8/13 against the live
  schema. **Narrowed:** 2026-08-13, closing gap #4 (Closed Gap C12), which
  made prep tickets real but left `appointments` itself local-only and the
  two writes non-atomic.
- **Decisions (user-confirmed before writing code):**
  1. Atomic treatment for all three operations (create/reschedule/remove),
     not just create — an inconsistent reschedule or delete is just as
     broken as an inconsistent create.
  2. Record which `EVENT_TEMPLATES` recipe an appointment was created from
     (`appointments.recipe_type`, a column that already existed but nothing
     wrote to) — `NULL` for a manually-built or AI-scheduled one.
- **Fixed by:** `supabase/add-appointment-atomic-writes.sql`:
  1. Upgrades `tickets.appointment_id` from the plain TEXT provenance column
     C12 added (back when `appointments` had no rows to reference at all) to
     a real `UUID REFERENCES public.appointments(id) ON DELETE CASCADE`.
  2. Three `SECURITY DEFINER` RPCs, manager-only (same role-check pattern as
     `insertHouseSopFn`/`decideValeFn`/`updateHouseholdBudgetFn` — enforced
     in the function body, not RLS, matching every other role restriction in
     this app): `create_appointment_with_preps` (inserts the appointment +
     every prep ticket in one transaction), `reschedule_appointment_with_preps`
     (updates the appointment + every prep ticket's `scheduled_start`/
     `appointment_title`/`reschedule_notice` in one transaction), and
     `delete_appointment_with_preps` (deletes the appointment; `ON DELETE
CASCADE` handles its prep tickets, no separate ticket-delete needed).
  3. `reschedule_appointment_with_preps` takes pre-computed per-ticket
     updates from its caller rather than formatting dates in SQL — the old
     `oldTime`/`oldDate` `reschedule_notice` fields still go through
     `isoToDisplayTime`/`isoToISODate` in TypeScript (`appointment.actions.ts`),
     which the RPC just writes verbatim. A ticket whose time didn't move
     omits the `reschedule_notice` key entirely (not `null`) so the RPC's
     `COALESCE(v_update->'reschedule_notice', reschedule_notice)` preserves
     whatever notice was already there — matches the old
     `useAppointments.update()`'s "only set a notice when the time moved"
     behavior exactly.
  - New `src/features/appointments/appointment.actions.ts`:
    `listAppointmentsFn` (plain authed select — `appointments_isolation` is
    a household-scoped `FOR ALL` policy, no RPC needed for reads),
    `createAppointmentFn`/`rescheduleAppointmentFn`/`deleteAppointmentFn`
    (each a thin wrapper calling the matching RPC via `.rpc(...)`). The
    `insertPrepTicketsFn`/`deleteTicketsByAppointmentFn`/
    `rescheduleAppointmentTicketsFn` functions C12 added to
    `task.actions.ts` are removed — fully superseded, since the atomic RPCs
    now own the whole appointment+prep-ticket flow even though they touch
    `tickets` too.
  - `use-appointments.ts` rewritten: `appointments` is now server-fetched
    state (fetch on mount/token-change, refetch after every write, same
    "write then refresh" pattern as C9–C13), and `add`/`remove`/`update`
    each call one RPC wrapper then refetch both `appointments` and the
    board's `tasks` (`refreshTasks`, threaded in from `app-store-provider.tsx`
    as `board.refresh`).
  - `new-appointment-modal.tsx` now threads its local `templateId` through
    `onAdd` as `recipeType` (previously computed but silently dropped).
  - `app-store-provider.tsx`'s `household-board-channel` gained a second
    `postgres_changes` listener (same channel, same household_id filter) for
    the `appointments` table, refetching `appointments` on any change —
    same "refetch on any change" treatment as `tickets`/`quick_utos`.
- **Verification:** `tsc --noEmit`, `eslint` (project-wide — same
  pre-existing warnings/CRLF noise noted in C12/C13, unrelated to this
  change), the Vitest suite, and a full `vite build` all pass clean.
  `supabase/add-appointment-atomic-writes.sql` was applied by the user
  directly (same no-service-role-key posture as C12/C13) — confirmed live
  2026-08-13: an unauthenticated PostgREST embed
  (`tickets?select=id,appointment_id,appointments(title)`) returned `200
[]` rather than a "could not find a relationship" error, confirming
  `tickets.appointment_id` is a real FK to `appointments`; all three RPCs
  (`create_appointment_with_preps`/`reschedule_appointment_with_preps`/
  `delete_appointment_with_preps`) responded with the expected `"Not
authenticated"` exception (not a 404), confirming they exist live. Not
  yet verified against a live signed-in session end-to-end.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9–C13 (writes always authenticate as whatever session token
  `AppStoreProvider` carries, today always a manager's) — though here it's
  moot in practice, since the RPCs' own manager-only check would reject a
  genuine helper session anyway. The three RPCs' manager-only checks are
  enforced in the function body, not RLS — same accepted-risk posture
  already documented for `house_sops`/`tickets`/`vales`/`households` in this
  app (a caller bypassing the `createServerFn` HTTP layer to call
  `.from("appointments").insert(...)` directly would still be subject to
  `appointments_isolation`'s household scoping, just not the role check),
  not a new gap introduced here.

### C15. `helper_notes.voice` never being populated is accepted as-is, not a bug (former gap #8)

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 9 (Voice-to-Task
  Promoter & SOP Translator). **Closed as accepted/no-action:** 2026-08-13,
  after re-reading the actual pipeline end to end (`transcribe-notes` and
  `promote-voice-task`, both in `LINARA/supabase/functions/`, added in the
  "voice-to-task and SOP simplifier edge functions" commit): neither edge
  function ever writes the audio anywhere -- `transcribe-notes` takes the
  base64 audio, runs it through Whisper, and returns only the transcript
  text; `promote-voice-task` takes that transcript and structures it into a
  task. The raw recording is deleted client-side immediately after. This
  isn't an incomplete implementation of a durable-audio feature -- it's a
  complete implementation of a transcript-only one. User-confirmed: there is
  no product need to keep the recording; the transcript is only useful as
  the resulting `helper_notes`/ticket content, not as something to play back.
- **Original finding, kept for context:** `plan.md` 5.1 and
  `helper_notes.voice`'s column comment ("Local URL path or pre-signed
  storage reference URL") both imply voice memos get a durable storage
  pointer, and the shared `household-evidence` bucket's
  `allowed_mime_types` (`['image/jpeg', 'image/png', 'audio/webm']`) doesn't
  even include the MIME type mobile's recorder actually produces
  (`audio/m4a` -- no mobile OS ships a native WebM encoder, so the
  `audio/webm` assumption only ever fit the web app's browser
  `MediaRecorder`). That mismatch is real, but moot: nothing tries to upload
  audio to that bucket in the first place, so it was never actually blocking
  anything.
- **Current/final state:** `helper_notes.voice` stays `NULL` for every
  voice-originated note, permanently, by design. Only the transcript is
  persisted (`helper_notes.text`). No further schema or code change is
  planned unless a real product requirement to replay original audio shows
  up later, at which point this would need to be reopened as a real feature
  request, not a bug fix.

### C16. `tickets.photo_evidence_url` stored an expiring signed URL, not a durable reference (former gap #13)

- **Found:** 2026-08-14, while answering a question about whether photos
  get cached client-side to avoid re-pulling from the storage bucket.
  **Fixed:** 2026-08-14, same session, after the user confirmed the
  re-signing approach below before any code was written.
- **Root cause:** `LINARA_MOBILE/services/media-upload.ts`'s
  `uploadEvidenceImage()` creates a signed URL with a 15-minute expiry and
  returns both that URL and the durable storage `path`, but the only call
  site (`app/(app)/pantry.tsx`'s `captureReceipt`) persists the expiring
  `signedUrl` (not the `path`) all the way into `tickets.photo_evidence_url`
  via `completeTicket()`. Nothing ever re-signed it, so every receipt or
  Done-card photo went dead ~15 minutes after upload.
- **Fixed by:** `src/features/tasks/task.actions.ts`'s `listTicketsFn` now
  re-signs `photo_evidence_url` on every read rather than requiring a
  `LINARA_MOBILE` change. A Supabase signed URL embeds its own storage path
  (only the trailing `?token=...` expires), so
  `extractHouseholdEvidencePath()` recovers the path with a regex against
  the `/storage/v1/object/sign/household-evidence/` segment, and
  `resignPhotoEvidenceUrl()` calls `storage.createSignedUrl()` fresh against
  it using the same authed client (a manager's) already used for the
  ticket query -- `storage-policies.sql`'s `household_evidence_isolation`
  policy is household-scoped via `current_household_id()`, the same as
  every other table's RLS, so that client already has standing to re-sign
  any object under its own household's path. A URL that doesn't match the
  pattern (e.g. a leftover pre-C18 `PHOTO_POOL` mock string, a plain
  Unsplash URL) or a resign that errors both fall back to the stored value
  unchanged rather than failing the whole board fetch over one bad photo.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. No migration was needed for this one (the
  fix reads the existing bucket/policy set up for C1/C12), so there's
  nothing new to confirm live via PostgREST. Not yet verified against a
  live signed-in session with a real (non-mock) uploaded photo older than
  15 minutes.
- **Known residual limitation, not closed by this fix:** The more correct
  long-term fix -- `LINARA_MOBILE` storing the durable `path` instead of the
  expiring `signedUrl`, so `LINARA` never has to parse a URL to recover it
  -- is still open on the mobile side, but no longer blocking: this fix
  works against the already-expired URLs mobile writes today, so the two
  repos don't need to land in lockstep.

### C17. `boardClosed` (the Pass board's open/closed-for-the-night flag) was not persisted anywhere (former gap #11)

- **Found:** 2026-08-14, while explaining Closed Gap C12's residual
  limitations in more depth. **Fixed:** 2026-08-14, same session.
- **Root cause:** `use-task-board.ts`'s `boardClosed` was plain
  `useState(false)` -- no table or column backed it, unlike the `queued`
  flag it drives (real, per C12) -- so it reset on every refresh, new tab,
  new device, or re-login even though the manager's mental model treats
  "closed for the night" as a standing state.
- **Fixed by:** `supabase/add-household-board-closed.sql` adds
  `households.board_closed BOOLEAN NOT NULL DEFAULT FALSE`. No new RLS
  policy was needed -- C13's `households_update_budget` UPDATE policy has
  no column list, so its existing `USING`/`WITH CHECK` (household-scoped)
  already covers this column too. `task.actions.ts` gained
  `getBoardClosedFn`/`setBoardClosedFn` (the latter manager-only, same
  role-check pattern as `updateHouseholdBudgetFn`). `use-task-board.ts`
  fetches the real value once on mount/token-change (alongside the existing
  `refresh()`), and `setClosed()` now writes through
  (`setBoardClosedFn`) in addition to updating local state, same
  optimistic-then-persist shape as every other write-then-refresh hook in
  this app. `startNewDay()`'s existing local `setBoardClosed(false)` reset
  now also persists via `setBoardClosedFn({ closed: false })` -- without
  this, a fresh simulated day would locally show the board reopened while
  the database still held `board_closed = true` from the night before,
  reintroducing the exact staleness this gap was about.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. This session had no service-role key (same
  posture as every prior migration), so
  `supabase/add-household-board-closed.sql` needs to be applied by hand --
  confirmed **not yet live** 2026-08-14 via an unauthenticated PostgREST
  `select id,board_closed` against `households`: a `42703` "column
  households.board_closed does not exist" 400, not the `200 []` a landed
  migration would return. Flagging here so the next session doesn't assume
  it's already applied the way C12–C14's migrations were.
- **Known residual limitation, not closed by this fix:** Per the gap's own
  scoped fix shape ("read it as an initial fetched value"), `board_closed`
  is fetched once on load, not kept in sync via Realtime the way
  `tickets`/`quick_utos`/`appointments` are (see C11/C12/C14's
  `postgres_changes` listeners) -- two managers with the board open on
  different devices won't see each other's open/close toggle until a fresh
  page load. Extending this to a live listener, if wanted, would follow the
  exact same pattern already used for those three tables.

### C18. General task photo evidence mock removed from `LINARA`'s vestigial helper surface (`LINARA` half of former gap #12)

- **Found:** 2026-08-14, investigating whether `LINARA`'s task-completion
  photo mock (`next-task-card.tsx`'s `PHOTO_POOL` random-pick) should be
  wired to something real. **Decided/fixed:** 2026-08-14, same session --
  there's nothing real to wire it to yet on either app (see original
  finding below), and per `AGENTS.md`'s helper-work-belongs-on-mobile
  boundary, a working-looking "Done · add photo" button that fakes an
  Unsplash stock photo on every tap doesn't belong on this repo's vestigial
  helper-facing surface regardless -- same reasoning as C13's removal of
  the vestigial grocery checklist.
- **Original finding, kept for context:** `LINARA_MOBILE/services/api/
tickets.ts`'s `completeTicket(ticketId, photoEvidenceUrl?)` is already
  generic (Palengke is just its documented example, not the whole scope),
  and the upload plumbing (`uploadEvidenceImage`/`household-evidence`
  bucket) already exists. But the general "Today" focus-task completion
  flow (`app/(app)/today.tsx`) only ever calls `completeTicket(ticketId)`
  with no photo -- no camera-capture UI exists there. Only
  `app/(app)/pantry.tsx`'s Palengke-specific flow actually captures one.
- **Fixed by:** `next-task-card.tsx`'s `done()` now calls
  `onUpdate(task.id, "done")` directly, with no photo argument, no
  `addingPhoto` fake-upload delay state, and no `Camera`/"Attaching
  photo…" UI -- the button just reads "Done". `task.constants.ts` (whose
  only export was `PHOTO_POOL`) is deleted outright rather than left with a
  dead constant, matching C13's "delete confirmed-zero-importer files"
  precedent.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. Nothing to verify live -- this fix only
  removes client-side mock behavior, no schema or write path changed.
- **Known residual limitation, not closed by this fix:** The
  `LINARA_MOBILE` half -- real camera-capture photo evidence for the
  general Today completion flow, reusing `pantry.tsx`'s
  `uploadEvidenceImage`/`completeTicket(ticketId, photoUrl)` pattern -- is
  unchanged and out of scope for this repo, per `AGENTS.md`.

### C19. `LINARA`'s Pay Dial (`SpendAndPayday`) computed net pay from hardcoded numbers instead of the real `helper_profiles.monthly_rate` (former gap #10)

- **Found:** 2026-08-14, cross-checking `execution_plan.md`'s "all 17
  stories complete" claim against live behavior while closing gaps
  #2/#4/#7. **Decisions (user-confirmed before writing code):** port the
  real per-cutoff Batas Kasambahay statutory-deduction math from
  `LINARA_MOBILE`'s `DigitalPayslip`, not just wire the wage in isolation
  and leave the flat ₱240 deduction as-is.
- **Root cause:** `spend-and-payday.tsx` hardcoded `baseSalary = 8000` and
  `governmentDeductions = 240`, neither derived from any real column. This
  wasn't just a missed wiring: `Helper`
  (`src/features/people/people.types.ts`) had no `monthlyRate`/
  `paydayInterval` field at all, even though `helper_profiles.monthly_rate`/
  `.payday_interval` were already real columns (`.payday_interval` already
  live before this session, confirmed below) -- so there was nowhere for a
  component like this to even get the real number without `toHelper()`
  being extended. The flat ₱240 also disagreed with the real formula's
  ₱375 for the same wage.
- **Fixed by:** `use-invites.ts`'s `HelperProfileRow` gained
  `payday_interval` (typing only -- `listHelperProfilesFn`'s `select("*")`
  already returned it). `Helper`/`toHelper()`
  (`people.types.ts`/`people.utils.ts`) gained `monthlyRate`/
  `paydayInterval`; `UNKNOWN_HELPER` gained matching placeholder values.
  `people.utils.ts` gained `computeStatutorySplit()` -- extracted from
  `legal-contribution-split-card.tsx`'s previously-inline copy of the exact
  same Batas Kasambahay formula (that card now calls the shared function
  instead of duplicating it, so the invite-preview card and the Pay Dial
  can no longer drift the way the flat ₱240 hardcode once did against this
  same formula) -- and `cutoffsPerMonth()` (2 for `semi_monthly`, 1 for
  `monthly`). `spend-and-payday.tsx` now computes `basePay =
monthlyRate / cutoffsPerMonth` and `governmentDeductions =
totalEmployee / cutoffsPerMonth`, exactly mirroring
  `LINARA_MOBILE`'s `digital-payslip.tsx`; the "half-month"/"monthly" label
  under the dial now reflects the helper's real `paydayInterval` instead of
  being hardcoded text. `restOwedRate` (₱120/hr) was left as-is -- not
  flagged as wrong by this gap, out of scope for this pass.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. `helper_profiles.payday_interval` was
  confirmed **already live** (no migration needed for this gap) via an
  unauthenticated PostgREST `select id,monthly_rate,payday_interval`
  against `helper_profiles`: a `200 []` response, not a "column does not
  exist" 400. Not yet verified against a live signed-in session with a real
  ACTIVE helper carrying a nonzero `monthly_rate` (needed to see anything
  other than ₱0 in the dial).
- **Known residual limitation, not closed by this fix:** Same "first ACTIVE
  helper stands in for a real per-helper session" caveat as C8 -- a
  multi-helper household's Pay Dial reflects whichever helper happens to be
  first, not a manager-chosen one.

### C20. `helper_profiles.monthly_rate` was write-once -- no admin path existed to change a helper's wage after invite

- **Found:** 2026-08-14, while answering a user question about where base
  salary gets adjusted in the admin, immediately after closing C19. Tracing
  every write to `helper_profiles.monthly_rate` turned up exactly one:
  `inviteHelperFn`, at invite creation. `updateHelperScheduleFn` (the only
  other post-invite mutator on this table, powering the Shifts editor) only
  ever touches `shift_start`/`shift_end`/`weekly_rest_day`/`break_start`/
  `break_end` -- wage isn't in its payload. `people-section.tsx`'s helper
  card shows the wage read-only (`Wage: ₱{inv.wagePHP}`) with a "View
  contributions split" toggle, but no edit affordance. So a manager giving
  a raise, or fixing a typo'd wage at invite time, had nowhere in the UI to
  do it -- not a Phase-3 gap or a mapping problem like #9/#10, just a
  missing mutator no story had asked for yet.
- **Fixed by:** `updateHelperWageFn` in `people.actions.ts` -- unlike
  `updateHelperScheduleFn`, explicitly manager-gated in the function body
  (same role-check pattern as `updateHouseholdBudgetFn`/`decideValeFn`),
  since wage is more sensitive than a shift window and shouldn't rely on
  household-scoped RLS alone. `use-invites.ts` gained `updateWage(id,
monthlyRate)` -- write-then-refresh (same pattern as
  `useGroceryList.setBudget`), since the new wage feeds several other real
  reads at once (Pay Dial, `LegalContributionSplitCard`, the minimum-wage
  compliance banner) that all need the fresh value. New
  `edit-wage-modal.tsx` (modeled on `invite-helper-modal.tsx`'s existing
  wage field, same compliance-warning and contribution-split preview)
  wired into `people-section.tsx` via a new "Edit wage" action next to
  "View contributions split", manager-gated by the same `canInvite` prop
  that already gates "Invite a helper". `payday_interval` was left
  immutable post-invite -- out of scope for this pass; only the wage amount
  itself was asked about and rarely does the interval change independent
  of a raise.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. No schema change was needed (`monthly_rate`
  already existed and was already writable by `inviteHelperFn`), so nothing
  new to confirm live via PostgREST. Not yet verified against a live
  signed-in manager session end-to-end.
- **Known residual limitation, not closed by this fix:** No audit trail for
  wage changes -- unlike `inviteHelperFn`'s below-minimum-wage check (which
  writes an `invite_flags` row for manager transparency), `updateHelperWageFn`
  doesn't flag a new wage that drops below `REGIONAL_MINIMUM_WAGE` the same
  way; the compliance banner on the People tab still catches it on next
  render (it's derived live from `wagePHP`, not from a stored flag), just
  without the audit-log entry a first-time low-wage invite gets.

### C21. No real archive backed "wage histories" or payment transfers for the digital payslip (former gap #9)

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 11 (Pay Ledger
  Statutory Breakdowns & EAS Builds) -- `roadmap/Story_11_...md` step 1
  asked for a payslip "mapping wage histories, HitPay transfers, and
  statutory split columns," but no table backed the first two, and
  `architecture.md` Section 5.3 marked the whole feature "Future Phase 3."
  **Closed:** 2026-08-14.
- **Vendor decision, made before any schema was written:** this gap's own
  text, `architecture.md`'s Section 5.3 sketch, and its sample JSON payload
  disagreed with each other on the vendor (HitPay per this gap, GCash/Maya
  per the section header, Brankas/PayMongo per the sample payload) -- none
  of which had been checked against a real API. HitPay was tried first:
  its Payout/Transfers API (`POST /v1/beneficiaries`, `POST /v1/transfers`)
  is real and documented for Philippines InstaPay/PESONet rails, but a live
  sandbox call (`POST /v1/beneficiaries/schema`) returned
  `{"message": "Feature access denied"}` with no self-serve dashboard
  toggle or documented enablement path -- dropped rather than built around.
  **Xendit was verified live instead**: `POST https://api.xendit.co/v2/payouts`
  (Basic Auth, secret key as username) with `channel_code: "PH_GCASH"` and
  separately `"PH_PAYMAYA"` both returned real `status: "ACCEPTED"`
  responses against the sandbox key, with no special account approval
  needed (unlike HitPay). Two wrong turns worth recording so a future
  session doesn't re-try them: `POST /payouts` (no `/v2`) rejects both
  `channel_code` and `bank_code` outright for this account -- a different,
  incompatible product from the same vendor; `POST /v3/payouts` demands an
  `api-version` header and a heavier `recipient.type`/`purpose_code`/
  `source_of_fund` compliance schema built for cross-border remittance, the
  wrong fit for a domestic PHP payroll payout.
- **Decisions (user-confirmed before writing code):**
  1. One table (`payslips`), not a `payslips` + `payment_confirmations`
     split -- a payslip here always implies an intended payout, so there's
     no state a second table would capture that `payslips.payout_*`
     doesn't already.
  2. Real per-cutoff vale settlement (`vales.settled_in_payslip_id`), not
     the simpler "snapshot the running approved-vale total" alternative --
     without it, a vale approved between two "Pay Now" clicks would be
     double-counted, since nothing previously marked a vale as "already
     paid out."
  3. Both a manager "Pay Now" action (calls Xendit directly) and a webhook
     confirm flow (Xendit calling back), not just one -- the "Pay Now"
     click gets an immediate `ACCEPTED`/error from Xendit's synchronous
     response, but only the webhook (`payout.succeeded`/`.failed`/
     `.reversed`) tells us the payout's true terminal outcome.
  4. The fake `WebhookPreviewModal` + "Transfer via GCash/Maya" buttons
     already sitting on the vestigial helper-facing `PayRecord`
     (`src/features/ledger/components/pay-record.tsx`) were removed
     outright, not left alongside the real feature -- same precedent as
     Closed Gaps C13/C18 (delete vestigial helper-surface mockups rather
     than build them out on a page `AGENTS.md` scopes out of this repo).
     They rendered a JSON payload preview with zero real API call, and fed
     off the exact stale `baseSalary = 8000` hardcode Closed Gap C19 had
     already fixed on the manager-facing `SpendAndPayday`.
- **Fixed by:**
  - `supabase/add-payslips-table.sql`: the `payslips` table (snapshotted
    `base_pay`/`statutory_employee_share`/`vale_deductions`/`net_pay` plus
    `payout_status`/`payout_external_id`/`payout_reference_id` tracking,
    same "denormalize a historical snapshot" reasoning as Closed Gap C10's
    `ledger_entries.title`/`.kind`), `vales.settled_in_payslip_id`,
    `payslips_isolation` RLS (join through `helper_profiles`, same pattern
    as `vales_isolation`), and `initiate_payslip` -- a `SECURITY DEFINER`
    RPC (same pattern as `create_appointment_with_preps`) that atomically
    inserts the payslip row and marks the helper's unsettled approved
    vales as settled in one transaction, since doing those two writes
    non-atomically risks double-counted or silently-dropped vales. Also
    guards against paying the same cutoff twice (a prior `failed` attempt
    doesn't block a retry; anything else does).
  - New `src/features/pay/`: `pay.actions.ts`'s `initiatePayoutFn`
    (manager-gated inside the RPC) computes the cutoff snapshot, calls the
    RPC, then calls Xendit directly and writes the result back with a
    second, non-atomic update (Postgres can't make outbound HTTPS calls,
    so this two-phase split is unavoidable -- see the file's own doc
    comment for the failure-mode tradeoff this accepts) -- on an
    immediate Xendit failure, the payslip is marked `failed` and its
    claimed vales are unsettled so the next "Pay Now" click can reclaim
    them. `pay.utils.ts`'s `currentCutoffRange` derives PH semi-monthly
    (1st-15th / 16th-end) or monthly cutoff boundaries from today's date --
    no cutoff-calendar table, same "pure function of today + interval"
    posture `cutoffsPerMonth` already had. `hooks/use-payslips.ts` and
    `components/payslip-history.tsx` (write-then-refresh, same pattern as
    C9-C20) wire "Pay Now" into `ManagerMoneyPage`, alongside the existing
    `SpendAndPayday`.
  - New `supabase/functions/xendit-payout-webhook/`: verifies Xendit's
    `X-CALLBACK-TOKEN` header (a static per-account token, not HMAC --
    Xendit's own mechanism, checked against
    `XENDIT_WEBHOOK_VERIFICATION_TOKEN`) against the value set via
    `supabase secrets set` (separate store from this repo's `.env`, same
    posture as `OPENAI_API_KEY`), writes with the service-role key
    (bypassing `payslips_isolation` -- no user session on an inbound
    webhook to check RLS against), and is idempotent: a payslip already
    `succeeded`/`failed` is a no-op, since Xendit retries an
    unacknowledged webhook for 24h.
  - `Helper` (`people.types.ts`/`people.utils.ts`) gained `phone` --
    `helper_profiles.phone` was already a real column but never threaded
    through `toHelper()` (only `Invite.phone` was), needed as the
    `account_number` sent to Xendit.
  - Fixed a live double-counting bug this change would otherwise have
    introduced: `SpendAndPayday`'s and mobile `pay.tsx`'s "approved vale
    total" summed every approved vale ever, with nothing marking one as
    already paid out. Both now filter on `!settledInPayslipId`, so a vale
    a past payslip already deducted stops shrinking the _next_ cutoff's
    live estimate forever.
  - `LINARA_MOBILE`: new `services/api/payslips.ts` (`getMyPayslips`, same
    read-only join-through-`helper_profiles` RLS pattern as `getMyVales`)
    and `components/features/pay/payslip-history.tsx`, wired into
    `app/(app)/pay.tsx` below `DigitalPayslip`. Read-only by design --
    "Pay Now" is manager-only and lives on `LINARA`'s web dashboard, per
    `AGENTS.md`'s helper-work-belongs-on-mobile /
    manager-work-belongs-on-web split applied to money-moving actions
    specifically. `digital-payslip.tsx`'s doc comment (which anticipated
    "HitPay payment confirmations and a multi-cutoff payslip history" with
    "no table backs either yet") is updated to point at the new
    `PayslipHistory` component instead of describing a gap.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean on `LINARA`; `tsc --noEmit` and `eslint` pass
  clean on `LINARA_MOBILE` (no test suite exists there to run). This
  session had no service-role key (same posture as every prior migration),
  so `supabase/add-payslips-table.sql` needs to be applied by hand --
  confirmed **not yet live** 2026-08-14 via an unauthenticated PostgREST
  `select id,cutoff_start,payout_status` against `payslips`: a `PGRST205`
  "Could not find the table" response, and a separate
  `select id,settled_in_payslip_id` against `vales`: a `42703` "column
  does not exist" 400 -- neither the `200 []` a landed migration would
  return. Flagging here so the next session doesn't assume either is
  already applied, same posture as Closed Gap C17. The new
  `xendit-payout-webhook` Edge Function also still needs `supabase
functions deploy xendit-payout-webhook`, a `supabase secrets set
XENDIT_WEBHOOK_VERIFICATION_TOKEN=...`, and that same token entered into
  Xendit's dashboard webhook settings (pointed at the deployed function's
  URL, subscribed to `payout.succeeded`/`payout.failed`/`payout.reversed`)
  before a real payout's confirmation can ever land -- none of that is
  something this session could do without dashboard access.
- **Correction, 2026-08-16:** the "not yet live" note above is **stale** --
  `payslips`/`vales.settled_in_payslip_id` have since been applied and are
  live (user-confirmed). Treat the payout path as production from here on.
  A separate 2026-08-16 audit found three real defects in it (reachable
  double-pay, timezone-broken cutoffs, and rest-owed shown as pay but never
  paid) -- see [`PAYMENTS_REMEDIATION.md`](PAYMENTS_REMEDIATION.md) for the
  evidence and the session-by-session plan. None of those are fixed yet.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9-C20 is moot here specifically, since `initiate_payslip`'s
  own manager-only check would reject a genuine helper session regardless.
  `initiatePayoutFn`'s two-phase, not-fully-atomic shape (DB write, then a
  separate Xendit call, then a second DB write) means a process crash
  between the RPC and the Xendit call could leave a payslip stuck at
  `pending_send` forever, indistinguishable from "still in flight" until a
  manager notices no webhook ever arrived -- no auto-retry or staleness
  detection exists for that state, accepted as low-stakes/out of scope for
  this pass (see `pay.actions.ts`'s own doc comment). PESONet (Xendit's
  second PH rail, for amounts routed differently than InstaPay) was never
  tested -- only the two e-wallet `channel_code`s (`PH_GCASH`/
  `PH_PAYMAYA`) this feature actually needs.

### C22. `HelperShell`'s "claim your account" banner was unreachable dead code with real data, and CI's e2e smoke test had never been re-verified against the real `helper_profiles`-backed app C8 shipped

- **Found:** 2026-08-14, chasing a `test:e2e` CI failure on `jamesDev`
  (`tests/claims-smoke.spec.ts` timing out waiting for
  `text=Magandang umaga, Ate Rosa.`).
- **Root cause (two separate bugs, one in the test, one in the app):**
  (1) `helper-shell.tsx`'s `myClaimed` was derived as
  `invites.invites.find(i => i.status === "active")` -- literally "does
  _any_ `helper_profiles` row in the household happen to be `ACTIVE`",
  the exact same field that also determines `helper` (`activeHelpers[0]`
  in `app-store-provider.tsx`). Since both booleans read the same
  underlying rows, `helper` being truthy (needed to render the greeting
  at all) _always_ implied `myClaimed` was also truthy, and when `helper`
  was null the component's early return (`!helper`) skipped the claim
  banner section entirely. Net effect: `text=New here? Claim your
account.` could never render in production, only in the pre-C8 mock
  roster this smoke test was originally written against. A related,
  _not_ fixed here: `ClaimAccountFlow`'s `onClaim(invite.id, ...)` passes
  the invite **code** (`terms.inviteCode` from `verifyClaimFn`) as the id,
  but `useInvites`'s `patch()` matches against `helper_profiles.id`
  (a UUID) -- these never match, so the local optimistic patch after a
  real claim is a silent no-op today. (2) Separately, the smoke test
  itself navigated straight to `/helper/today` with no session at all;
  `useInvites` only fetches `helper_profiles` once a manager `token`
  exists (see its own doc comment), so even with bug (1) fixed the test
  had no path to real data. CI's `SUPABASE_URL` mock literal
  (`https://mock-supabase-url.supabase.co`, `ci.yml`) was never reachable
  either way, so this had silently never worked since C4 wired
  `test:e2e` into CI.
- **Fixed by:** `helper-shell.tsx`'s `myClaimed` now tracks "did _this
  device_ complete its own claim" via a new `linara_helper_claimed_name`
  localStorage key, set by `claim-account-flow.tsx` alongside the
  existing `linara_helper_*` keys right after a successful
  `claimInviteFn` call -- independent of any `helper_profiles.status`
  read, matching the same "no real per-helper session, track locally"
  posture already used for `linara_manager_token` (`use-session.ts`).
  The claim banner is reachable again. For the test: added
  `tests/support/mock-supabase-server.ts`, a small local HTTP stub
  answering the exact endpoints `people.actions.ts`'s server functions
  call (`auth/v1/user`, `rest/v1/user_profiles`, `rest/v1/helper_profiles`)
  with fixture data; `playwright.config.ts` starts it and points
  `webServer.env.SUPABASE_URL` at it (overriding `ci.yml`'s dead literal
  for the e2e run only -- `ci.yml` itself untouched). Mocking at the
  browser network layer (`page.route()`) was tried first and abandoned:
  these are TanStack Start server functions, called via a `_serverFn/
<base64 id>` RPC using `seroval` wire-format serialization, and the
  actual Supabase calls happen server-side inside the spawned `vite dev`
  process -- neither layer is interceptable from the browser context
  Playwright controls, only the real network boundary (Supabase's own
  HTTP endpoints) is. `tests/claims-smoke.spec.ts` seeds
  `linara_manager_token` via `page.addInitScript` and asserts against the
  fixture helper's real name instead of a hardcoded literal.
- **Verification:** `tsc --noEmit`, `eslint` (scoped to touched files --
  the repo-wide run is swamped by pre-existing Windows-checkout CRLF
  noise, see below), the Vitest suite, `vite build`, and `npx playwright
test` all pass locally, including a from-scratch `rm -rf node_modules
&& npm ci` against both npm 10.9.2 (CI's actual bundled version, Node 22) and npm 11.
- **Known residual limitation, not closed by this fix:** The
  `onClaim`/`patch()` id-mismatch bug noted above (code vs. UUID) is
  real but separate -- the claimed helper's row still gets a correct
  status via the next `refresh()` (manager re-opens People, or reloads),
  just not optimistically. Not fixed here to keep this pass scoped to
  what was actually breaking CI. Separately, a full-repo `npx eslint .`
  or `npx prettier --check .` run on this Windows checkout reports
  thousands of false-positive CRLF findings unrelated to any real
  formatting issue -- `core.autocrlf=true` with no `.gitattributes` to
  pin line endings. Not fixed here (out of scope, and CI itself runs on
  Linux where this doesn't occur); flagging so a future session doesn't
  mistake that noise for real lint debt.

### C23. `quick_utos`/`tickets` realtime subscriptions silently never fired -- required an app restart to see changes

- **Found:** 2026-08-14, while manually testing Quick Utos in `LINARA_MOBILE` and
  seeing changes only appear after killing and reopening the app.
- **Root cause:** Both `LINARA_MOBILE/hooks/use-realtime-subscription.ts` and
  `LINARA/app-store-provider.tsx` correctly call
  `supabase.channel(...).on('postgres_changes', ...).subscribe()` against
  `public.quick_utos` and `public.tickets`, matching what `LINARA_MOBILE`'s
  `Story_3_DatabaseRealtimeAndStoragePipes.md` (step 4, AC "Modifying a row
  in the database table triggers an immediate realtime callback on the
  client") and `architecture.md` Section 9.1 describe. But neither table
  had ever been added to the `supabase_realtime` publication -- no
  migration or dashboard step ever did it, in any environment. `.subscribe()`
  succeeds with no error in this state; the channel connects but never
  receives events. A restart masked it because a fresh mount re-fetches via
  TanStack Query (`getPendingQuickUtos`), which made it look like the
  client-side subscription code was the problem when it was actually a
  missing schema-side prerequisite. (Initially suspected as a free-tier
  compute limitation -- it isn't; Postgres Changes works on Supabase's free
  tier, the publication was just empty.)
- **Fixed by:** `supabase/enable-realtime-quick-utos-tickets.sql` (`ALTER
  PUBLICATION supabase_realtime ADD TABLE public.quick_utos, public.tickets`
  + `REPLICA IDENTITY FULL` on both, so UPDATE/DELETE payloads carry full
  old-row data for the `recipient_id`/`helper_id` filters to match against).
  Also documented in `architecture.md` Section 8 (Realtime Publication) so
  it isn't only a standalone `.sql` file a future environment could miss.
- **Also noted:** Any new table that needs live client updates (mirroring
  this pattern) needs the same two-line addition -- it's not implied by
  creating the table or writing a `postgres_changes` listener alone.

### C24. `initiatePayoutFn` sent Xendit payouts 100x the intended amount (centavos-style multiplier against an API that already expects the major unit)

- **Found:** 2026-08-14, user tried a "Pay Now" GCash payout for ₱3,563 and
  Xendit's dashboard showed ₱356,250 for `reference_id
  3b1da7c1-c212-4a29-97f2-f72df887283e` -- a ~100x inflation.
- **Root cause:** `pay.actions.ts`'s `initiatePayoutFn` sent `amount:
  Math.round(netPay * 100)` to `POST /v2/payouts`, following the
  Stripe-style convention of expressing amounts in the smallest currency
  unit (cents/centavos). Xendit's Payouts API doesn't work that way for
  PHP -- `amount` is the literal peso amount (decimals allowed for
  centavos), not centavos-as-an-integer. A `netPay` of `3562.50` became
  `356250`, which Xendit read as ₱356,250.00.
- **Confirmed low-stakes this time:** `.env`'s `XENDIT_SECRET_WRITE_KEY` is
  `xnd_development_...` (sandbox), so no real funds moved on this
  transaction. Would not have been low-stakes against a `xnd_production_...`
  key.
- **Fixed by:** changed to `amount: Math.round(netPay * 100) / 100` (rounds
  to the nearest centavo without the 100x multiplier) in
  `pay.actions.ts`'s `initiatePayoutFn`.
- **Also noted:** No test coverage exercises the actual Xendit request body
  (a real API call, correctly excluded from CI) -- this class of bug can
  only be caught by unit-testing the payload construction in isolation or
  by manual sandbox verification like this one. Worth adding a narrow unit
  test around the request body if this path is touched again.

### C25. Pantry stock levels (`usePantry`) were pure local `useState` seeded from an 11-item hardcoded mock, never connected to the real `pantry_items` table

- **Found:** 2026-08-14, user noticed the manager-facing Pantry page always
  shows the same fake items ("Rice", "Sofia's cereal", "Garlic"...)
  regardless of household.
- **Root cause:** `pantry.constants.ts`'s `INITIAL_PANTRY` seeded
  `usePantry()`'s `useState` directly -- no Supabase read/write anywhere in
  the hook, unlike every other feature store in this app (Vales/Ledger/
  Groceries/Tasks/Appointments/Payslips), all of which were migrated off
  local mocks by earlier gaps (C8-C21). `pantry_items` (`architecture.md`
  §8) already existed live with the exact columns the client `PantryItem`
  type needs (`name`/`qty`/`unit`/`par`/`category`) and a plain
  household-scoped `pantry_items_isolation` RLS policy, matching
  `grocery_items`'s -- confirmed live via an unauthenticated PostgREST
  `select id,name,qty,unit,par,category`: a `200 []` response, not a "does
  not exist" 400. So unlike most prior gaps, no migration was needed at
  all -- the schema had simply never been wired up to any UI.
  `plan.md` §2.5 clarifies stock levels are meant to be manually maintained
  by the Cook (a helper), not AI-generated -- `USE_MOCK_AI` is unrelated,
  it only governs the three edge-function agents in `aiagent.md`.
- **Also found while closing this:** `useGroceryList`'s low-stock ->
  auto-suggested-grocery-item logic (`grocery.actions.ts`/
  `use-grocery-list.ts` lines ~78-91, matching `plan.md` §2.5's
  "Auto-Generated Shopping List" step) was already fully built against
  `pantry.items` -- it was just running on fake data. No changes were
  needed there; it started working for real the moment `usePantry` did.
- **Fixed by:** New `src/features/pantry/pantry.actions.ts`
  (`listPantryItemsFn`/`insertPantryItemFn`/`updatePantryItemQtyFn`/
  `deletePantryItemFn`), following the exact same auth/household-scoping
  pattern as `grocery.actions.ts` -- no manager-only gating, since
  `pantry_items_isolation` is a plain household-scoped policy and plan.md
  has a helper (the Cook) writing to this data too. `use-pantry.ts`
  rewritten: `items` is server-fetched state, fetched on mount/token-change;
  `add`/`remove` write-then-refresh (same pattern as C9-C21); `setQty`/
  `adjust` are optimistic-with-rollback instead (update local state
  immediately, persist async, and on failure `refresh()` to pull the real
  value back) -- the +/- buttons need snappy repeated-click feedback the old
  synchronous mock had, and `adjust`'s delta math reads the already-
  optimistic local `items` state so rapid clicks compose correctly instead
  of racing a round trip. `app-store-provider.tsx`'s `usePantry()` call
  threads `session.token`/`ready` through (same as `useVales`/
  `usePayslips`), and gained a third `postgres_changes` listener on the
  existing `household-board-channel` (same `household_id` filter) for
  `pantry_items`, refetching on any change -- same "refetch on any change"
  treatment as `tickets`/`appointments` on that channel; `PantryStore` grew
  a `refresh()` method to support it. `pantry.constants.ts`
  (`INITIAL_PANTRY`, zero other importers) deleted outright, same
  "delete confirmed-dead mock" precedent as C8/C13.
- **Verification:** `tsc --noEmit`, `eslint` (touched files clean; the
  pre-existing repo-wide CRLF noise from C22 is unrelated and untouched),
  the Vitest suite, and a full `vite build` all pass clean. Also verified
  live end-to-end against a real signed-in manager session: a
  Playwright-driven browser walkthrough -- login -> Pantry page -> confirmed
  the page renders genuinely empty (not the old `INITIAL_PANTRY` mock's
  Rice/cereal/etc -- household's real `pantry_items` had zero rows) -> added
  a real item -> confirmed it rendered -> hard-reloaded the page and
  confirmed the item survived (proving persistence, not local state) ->
  adjusted its qty with the `+` button -> reloaded again and confirmed that
  persisted too -> removed the item via the UI as cleanup and confirmed it
  was gone after one more reload, leaving the test household as found.
- **Known residual limitation, not closed by this fix:**
  - At the time this was written, `PantryPage` was still mounted at both
    `/manager/pantry` and the vestigial `/helper/pantry` (see the
    `ViewAsSwitcher`/`HelperShell` discussion this gap was found during), so
    a write from either route authenticated as whatever session token
    `AppStoreProvider` carried (always a manager's), not a genuinely
    separate helper identity -- same posture as C9-C14. **Superseded by
    C26**, which removed `/helper/pantry` and the rest of the vestigial
    helper-facing web surface entirely -- `PantryPage` is now manager-only.
  - Two transient issues surfaced during the live browser verification above
    that are **not** attributed to this fix -- flagging so a future session
    doesn't waste time re-diagnosing from scratch, not because either is
    confirmed to need a fix: (1) a hard page reload occasionally (seen once
    across several full test runs, not reliably reproducible) bounced the
    browser back to `/login` instead of staying signed in, then recovered
    once logged back in -- `use-session.ts`'s rehydration effect only clears
    the stored token and falls back to `"anon"` if `getManagerProfileFn`
    throws, consistent with an occasional transient failure of that one call
    under a fast reload, not a bug reproduced on demand. (2) a Supabase
    Realtime `"tried to join multiple times"` console error appeared in two
    of several full test runs (never in isolated reload-only runs) -- the
    same `household-board-channel` re-subscribe-on-dependency-change pattern
    already used for `tickets`/`appointments` since C12/C14, and an isolated
    test on the pre-this-fix code with the same reload count never
    reproduced it either, so this reads as a pre-existing timing race in
    that shared effect (most likely `currentHelperId`/`session.householdId`
    changing mid-flight, re-running the effect's cleanup+recreate) that a
    busier test session has more chances to hit, not something this fix's
    `pantry_items` listener newly introduced. Neither issue affected the
    actual read/write correctness verified above.

### C26. Removed the vestigial helper-facing web surface (`/helper` route tree, `ViewAsSwitcher`'s persona toggle, and everything only reachable from either)

- **Found:** 2026-08-14, user asked whether the `ViewAsSwitcher`'s "Helper"
  pill (`TopBar`) really did let a manager preview a helper's mobile-equivalent
  view from inside this web app. It did -- a full parallel `/helper` route
  tree (`today`/`pantry`/`pay`), rendered inside a separate `HelperShell`,
  live on the deployed Vercel app for any signed-in manager. `AGENTS.md`
  already states the helper-facing Worker's Station lives exclusively in
  `LINARA_MOBILE`; C13/C18/C21 had each already stripped *pieces* of this
  surface (the grocery checklist, a fake photo button, fake payout buttons)
  for duplicating real `LINARA_MOBILE` execution work, but the shell around
  it was never removed, just hollowed out piece by piece.
- **Root cause:** Predates the mobile split -- this was originally a
  single app serving both roles. Nothing since the split ever did a full
  sweep to remove the leftover half; each gap closure only touched the one
  feature it was scoped to.
- **Confirmed before deleting anything:** `LINARA_MOBILE` already has its own
  real claim flow (`app/(auth)/claim-account.tsx`, `flag-terms.tsx`,
  `review-terms.tsx`, `welcome.tsx`) and real per-helper Supabase auth
  (`helper_notes` RLS keys off `auth.uid()` -- the Privacy Wall `AGENTS.md`
  describes), so nothing deleted here was the *only* copy of any real
  functionality. `src/features/notes/` (the helper's "My Notes" widget) was
  additionally confirmed to be a pure `localStorage` mock -- never wired to
  the real `helper_notes` table at all, not even partially.
- **Fixed by:**
  - Deleted the whole `/helper` route tree (`src/routes/_app/helper*`) and
    every component/page reachable only from it: `helper-shell.tsx`,
    `helper-today-page.tsx`, `helper-task-lists.tsx`, `end-of-day.tsx`,
    `pay-record-page.tsx`/`pay-record.tsx`, `claim-account-flow.tsx`/
    `claimed-welcome.tsx`, `block-reason-modal.tsx`, `next-task-card.tsx`,
    `quick-utos-feed.tsx`/`utos-chip.tsx`, `my-week-card.tsx`,
    `rosa-avail-control.tsx`, and the entire `src/features/notes/` folder.
    Each was verified to have zero importers outside this surface via
    repo-wide grep before deletion.
  - `view-as-switcher.tsx` rewritten to only switch between co-manager
    `admins` (the real, non-vestigial half of what it did) -- the `helper`
    prop and persona-toggle branch are gone; `top-bar.tsx` stopped
    threading `helper` into it. `nav.constants.ts`'s `HELPER_NAV` removed.
  - `use-invites.ts`'s `findByCode`/`claim`/`flag` removed (local-only
    display patches whose only caller was `helper-shell.tsx`); `resolveFlag`
    kept (real caller: `manager-pass-page.tsx`).
  - `people.actions.ts`'s `verifyClaimFn`/`flagInviteFn`/`claimInviteFn` and
    their dedicated `PendingInviteRow`/`ClaimHelperInviteRow` types removed
    -- `LINARA_MOBILE` calls the underlying `lookup_pending_invite`/
    `flag_invite`/`claim_helper_invite` RPCs directly against Supabase, not
    through these TanStack server functions, so mobile is unaffected.
    `inviteHelperFn`/`cancelInviteFn`/`listHelperProfilesFn`/
    `updateHelperWageFn` untouched.
  - `palengke-chip.tsx`'s `to` prop (`"/manager/pantry" | "/helper/pantry"`)
    removed entirely -- its one remaining caller always used the default.
  - `routes/index.tsx`'s public landing page CTA "May Invite Code ako
    (Helper)" (linking to `/helper/today`) removed -- user-confirmed no
    replacement; no public web-based helper onboarding exists anymore.
  - **Also removed, per user decision:** the e2e test layer. `tests/
claims-smoke.spec.ts` exclusively exercised the now-deleted `/helper/today`
    claim banner; there was no other e2e test in the repo. Deleted alongside
    it: `tests/support/mock-supabase-server.ts`, `playwright.config.ts`, the
    `@playwright/test` devDependency and `test:e2e` script, and the "Install
    Playwright Browser"/"Run e2e" steps in `.github/workflows/ci.yml`
    (originally added by C4, fixed further by C22).
- **Verification:** `tsc --noEmit`, `eslint` (touched files clean; repo-wide
  CRLF noise is the same pre-existing/unrelated issue as C22), the Vitest
  suite, and a full `vite build` all pass clean -- the build's own chunk list
  confirms no `helper-*` SSR chunk is emitted anymore, and `routeTree.gen.ts`
  regenerates with zero `/helper` entries. `npm install` re-run to sync
  `package-lock.json` after the Playwright removal.
- **Known residual limitation, not closed by this fix:** This repo now has
  **zero end-to-end test coverage** -- the only e2e test existed to test the
  surface just deleted. A real manager-facing smoke test (e.g. "manager logs
  in, Pass board loads") is separate future work; `tests/support/
mock-supabase-server.ts`'s stub-Supabase-server approach is reusable for
  that (it already stubs `auth/v1/user`/`user_profiles`/`helper_profiles`;
  it would need `tickets`/`households` stubs added too), but was deleted
  here rather than built out, to keep this pass scoped to deletion.
- **Follow-up, same day:** `inviteHelperFn`'s returned `inviteUrl`
  (`/claim?code=...`) pointed at a `/claim` route that never existed in this
  app and was confirmed to have zero readers (`grep -rn "inviteUrl" src`) --
  `use-invites.ts`'s `create()` only ever consumed `result.helperId`/
  `.inviteCode`. Removed the dead field and its string entirely; `status`
  stays on the return shape (a real, if currently unconsumed, part of the
  contract -- not a dangling reference like `inviteUrl` was).

### C27. `currentHelperId` (`activeHelpers[0]`) was a single, unstable stand-in for "the helper" across most helper-scoped features -- broke down for 2+ active helpers

- **Found:** 2026-08-14, user asked what could go wrong with a large number
  of helpers, prompted by that day's `/helper` surface removal (C26). Full
  design writeup and per-area detail live in
  [`MULTI_HELPER_HANDLING.md`](MULTI_HELPER_HANDLING.md) -- this entry is a
  pointer, not a duplicate, matching how `aiagent.md` holds full prompt
  detail while this file only points at it.
- **Root cause:** `currentHelperId` (`app-store-provider.tsx`) was
  `activeHelpers[0]`, ordered `created_at DESC` by `listHelperProfilesFn` --
  the most recently invited active helper, not a manager's actual choice,
  silently changing as new helpers claimed their accounts. Quick Utos, the
  after-hours Ledger, the Availability friction wall, and the Pay Dial all
  keyed off this one value.
- **Fixed in three passes, 2026-08-14 to 2026-08-15** (see
  `MULTI_HELPER_HANDLING.md` for full detail on each):
  1. **Quick Utos + Ledger:** a real recipient picker; AI `suggestedStation`
     surfaced (never auto-applied) via a toast; `ledger.record` follows the
     utos's own `toHelperId`. The friction wall (`use-send-gate.ts`) was
     generalized via a new `statusFor(helperId, schedules, nowTs, manual?)`
     (`availability.utils.ts`), which also fixed a pre-existing live bug in
     `addTask` (assigning a task to any helper other than `currentHelperId`
     silently skipped the off-shift warning entirely) -- not new scope, a
     bug this same generalization happened to close.
  2. **Pay Dial / payslip history:** `ManagerMoneyPage` gained a helper
     switcher (same picker pattern). Found while fixing it: `LedgerEntry`
     (the client type) had no `helperId` field at all, even though
     `ledger_entries.helper_id` was already being fetched --
     `toLedgerEntry()` just never mapped it through, so the Pay Dial's
     rest-owed-minutes math was summing *every* active helper's ledger
     entries into one dial regardless of whose numbers it claimed to show. A
     switcher alone would not have fixed that; added `LedgerEntry.helperId`,
     set from `row.helper_id`.
  3. **The manual "Available for N hours" opt-in:** confirmed real and
     actively used on `LINARA_MOBILE`'s Today tab (`DignityHeader`/
     `RosaAvailControl`, not dead code) but written only to that device's
     own local storage (`AsyncStorage` on mobile, `localStorage` on web,
     the latter already unreachable post-C26) -- never Supabase, so neither
     app could see the other's copy. Closed via
     `supabase/add-helper-manual-availability.sql`
     (`helper_profiles.manual_status`/`.manual_available_until` -- no RLS
     change needed, `helper_profiles_isolation` already lets a claimed
     helper's own session write her own row directly), `statusFor()`
     gaining a `manual` param usable for any helper, `useAvailability`
     simplified to read-only, and `LINARA_MOBILE`'s
     `use-rosa-availability.ts` switching from `AsyncStorage` state to a
     pure derivation fed by a real Supabase-backed profile fetch +
     mutation (new `services/api/availability.ts`).
- **Verification:** `tsc --noEmit`, scoped `eslint`, `vitest`, and `vite
  build` all pass clean on `LINARA`; `tsc --noEmit` and `eslint` pass clean
  on `LINARA_MOBILE` (no test suite there). `supabase/
  add-helper-manual-availability.sql` needs to be applied by hand -- same
  no-service-role-key posture as every prior migration in this file --
  confirmed **not yet live** as of this writing via an unauthenticated
  PostgREST `select id,manual_status,manual_available_until` against
  `helper_profiles`: a `42703` "column does not exist" 400, not the `200
[]` a landed migration would return. Not yet verified against a live
  signed-in multi-helper household end-to-end.
- **Known residual limitation, not closed by this fix:** None of the three
  passes touch `LINARA_MOBILE` beyond what's described above, and no
  realtime channel was added for the manual opt-in -- a helper's mobile-side
  change is picked up by the web app on its next `helper_profiles` refetch
  (mount/token-change), not instantly, which was judged sufficient (see
  `MULTI_HELPER_HANDLING.md`'s verification notes).

### C28. Time simulation (`use-sim-clock.ts`) caused real testing confusion, silently pinning every default-configured helper to "off" for the rest of a session

- **Found:** 2026-08-15, tracing why a freshly-invited helper with default
  shift/rest-day values kept showing as off-shift/resting no matter what the
  real wall clock said.
- **Root cause:** `sim-clock.tsx`'s "After shift · 7:00 PM" and "Rest day ·
  Sun 10 AM" demo presets exactly match every new helper's default
  `shiftEnd`/`restDay` (`invite-helper-modal.tsx`: 19:00 / Sunday). Clicking
  either during testing sets `use-sim-clock.ts`'s `offsetMs`, which never
  auto-resets -- every subsequent `statusFor()` call for a default-configured
  helper then reads as permanently off/resting for the rest of the browser
  session, with no visible indication `nowTs` had drifted from real time
  beyond the small `SimClock` pill in the top bar.
- **Fixed by:** Disabled the mechanism rather than deleting it, so it can be
  re-enabled for a future demo without a rebuild. `use-sim-clock.ts` now
  always ticks off real `Date.now()` (`offsetMs` hardcoded `null`,
  `setOffsetMs` a no-op); the original offset-driven implementation is kept
  intact inside a block comment immediately below, with instructions for
  restoring it. `top-bar.tsx`'s `<SimClock>` import and render are commented
  out (not deleted); `sim-clock.tsx` itself is untouched, since it was
  already only reachable from that now-commented render.
- **Re-verified (item 2 of the same pass):** with sim time disabled, a
  freshly-invited default helper (06:00-19:00 shift, Sunday rest day) reads
  correctly against real wall-clock time via `statusFor()`
  (`src/features/availability/availability.utils.ts`) -- on-shift during
  business hours, off outside quiet hours once past 19:00, resting on a real
  Sunday. `statusFor()` itself has no other default-leaning shortcut; its
  quiet-hours/shift/manual-opt-in checks all take real `nowTs` with no
  sim-clock dependency.
- **Verification:** `tsc --noEmit`, scoped `eslint` (touched files clean;
  repo-wide CRLF noise is the same pre-existing/unrelated issue noted in
  C22/C25), the Vitest suite, and a full `vite build` (SSR + client) all pass
  clean; the build's chunk list confirms no behavior change to the removed
  render path.
- **Known residual limitation, not closed by this fix:** None -- the demo
  clock is fully inert, not partially working.

### C29. Quick Utos default recipient wasn't availability-aware; the recipient picker was ordered by invite recency, not name

- **Found:** 2026-08-15, same pass as C28, auditing Pass-board UX now that
  sim time no longer masks real availability state.
- **Root cause:** `app-store-provider.tsx`'s Quick Utos recipient defaulted
  to `currentHelperId` (`activeHelpers[0]`, most-recently-invited -- see
  `MULTI_HELPER_HANDLING.md`) with no regard for whether that helper was
  actually reachable right now. A manager inviting a second helper who
  happened to be off-shift would see the newer helper pre-selected by
  default even while the first helper was on-shift and reachable.
  Separately, `quick-utos-launcher.tsx`'s recipient `<select>` listed
  `activeHelpers` in that same newest-invited-first order, not alphabetical
  or availability order, making the picker harder to scan as a household's
  helper roster grows.
- **Fixed by:** `app-store-provider.tsx` now computes `defaultUtosRecipientId`
  via `statusFor()`/`manualFromRow()`
  (`src/features/availability/availability.utils.ts`): the first active
  helper (in existing roster order) whose status isn't `"off"`, falling back
  to `currentHelperId` only when nobody is reachable. A manager's explicit
  pick (`pickedUtosHelperId`) still always wins, unchanged.
  `quick-utos-launcher.tsx` sorts a **local copy** of `activeHelpers`
  alphabetically by name for the `<select>` only -- the shared
  `activeHelpers` array itself is untouched, so lane order elsewhere (Pass
  board, task/routine/appointment assignment dropdowns) is unaffected.
  Alphabetical was chosen over live-availability ordering because the latter
  would silently reshuffle option positions under the manager while the
  dropdown is open (status can flip on `clock.nowTs`'s 30s tick) -- bad UX
  for a native `<select>`.
- **Verification:** `tsc --noEmit`, scoped `eslint`, the Vitest suite, and a
  full `vite build` all pass clean.
- **Known residual limitation, not closed by this fix:** The AI Router's
  `suggestedStation` toast (see `MULTI_HELPER_HANDLING.md`) is unchanged --
  still surfaced, never auto-applied. `MULTI_HELPER_HANDLING.md` updated
  alongside this entry.

### C30. "Start new day" fired immediately with no confirmation or preview, and its Quick Utos clear only ever covered the current recipient, not every active helper

- **Found:** 2026-08-15, same pass as C28/C29. `manager-pass-tab.tsx`'s
  "Start new day" button called `onStartNewDay` directly on click -- no
  dialog, no preview, no success toast -- for an action that permanently
  deletes pending Quick Utos, persists `board_closed = false`, and spawns
  new routine tickets in one click. Auditing what the delete actually
  covered (to write an accurate preview) turned up a second, sharper bug:
  `use-utos.ts`'s `clearForNewDay()` only ever deleted
  `quick_utos` rows for `toHelperId` (the **current Quick Utos recipient**,
  see `MULTI_HELPER_HANDLING.md`), not every active helper's pending utos.
  In a multi-helper household, "Start new day" was silently leaving a second
  helper's Quick Utos untouched -- not documented anywhere as intentional,
  and not what `utos.types.ts`'s "deliberately ephemeral... genuinely
  deletes them" doc comment implies.
- **Decision (user-confirmed before writing code):** fix the household-wide
  clearing gap in the same pass rather than just word around it, since an
  accurate confirmation-modal preview needs to describe what actually
  happens.
- **Fixed by:**
  - `utos.actions.ts` gained `clearAllUtosForHelpersFn({ token, helperIds })`
    (`DELETE ... WHERE recipient_id IN (helperIds)`) and
    `listUtosForHelpersFn({ token, helperIds })` (id-only select, used only
    for the confirmation preview's live count). `clearUtosForHelperFn` is
    removed -- confirmed zero callers once `use-utos.ts`'s `clearForNewDay`/
    `wipedToday` were removed alongside it (`wipedToday` was already
    write-only, no reader anywhere in the app, even before this change).
  - `app-store-provider.tsx` gained a shared `runDayRollover(targetDate)`:
    runs the household-wide clear (`activeHelpers.map(h => h.id)`) and
    `board.startNewDay(targetDate)` in parallel, then `utos.refresh()` so the
    current recipient's list reflects the clear. The exposed `startNewDay`
    (now `() => Promise<void>`) computes `target = simDate + 1 day`, awaits
    `runDayRollover`, and shows a success toast reporting the real counts.
    New `previewNewDay(): Promise<{ pendingUtos, routinesRespawning }>`
    fetches the same live counts without mutating anything.
  - `use-task-board.ts`'s `startNewDay` is generalized to
    `startNewDay(targetDate: Date): Promise<{ routinesRespawned: number }>`
    (same respawn logic, now parameterized and awaited instead of
    fire-and-forget) and gained a pure `previewRespawnCount(targetDate)` --
    both reuse a shared `routinesToSpawn()` so the preview can't drift from
    what actually spawns.
  - New `start-new-day-modal.tsx` (styled like `invite-helper-modal.tsx`)
    shows the live preview ("N pending Quick Utos will be cleared", "M
    routines will respawn for tomorrow", "The board will reopen") with
    Cancel / Start new day actions. `manager-pass-page.tsx` owns the modal's
    open state and fetches the preview when it opens; `onStartNewDay` passed
    to `ManagerPassTab` now opens the modal instead of calling `startNewDay`
    directly -- `manager-pass-tab.tsx` itself needed no changes, its button
    already just calls whatever `onStartNewDay` prop it's given.
- **Verification:** `tsc --noEmit`, scoped `eslint`, the Vitest suite, and a
  full `vite build` all pass clean. No schema change was needed for this
  entry specifically (see C31 for the related `board_date` migration, not
  yet applied live).
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9-C21 -- the household-wide clear authenticates as whatever
  session token `AppStoreProvider` carries (today, always a manager's).

### C31. Nothing caught a manager who never manually clicked "Start new day" and returned after the real calendar day had moved on

- **Found:** 2026-08-15, same pass as C28-C30, while implementing the
  auto-rollover half of the original ask ("compare the board's current day
  against the real device date on load"). That literal check doesn't
  actually catch the described bug: `simDate`
  (`use-task-board.ts`) is local `useState(() => new Date())` -- it
  self-corrects to "today" on every fresh page load, so a plain reload never
  looks stale by that comparison alone. The real bug is that
  `households.board_closed` and "have today's routines spawned yet" are
  never reconciled if a manager closes the board one night and never
  manually clicks "Start new day" before the next real session: on reload,
  `simDate` trivially matches today, but `board_closed` stays `true` from
  whenever it was last set (possibly several real days ago) and no routine
  tickets were ever spawned for any of the intervening days, since only
  `startNewDay()` spawns them.
- **Decision (user-confirmed before writing code):** apply the catch-up
  silently with a passive toast notice, not the same blocking confirmation
  as the manual "Start new day" button (see C30) -- the day has already
  moved on by the time anyone's looking, so gating it behind a click just
  delays a manager from seeing today's real board.
- **Fixed by:**
  - `supabase/add-household-board-date.sql` adds
    `households.board_date DATE NOT NULL DEFAULT CURRENT_DATE` -- the
    calendar day the board was last explicitly rolled to, persisted so
    staleness can be detected across reloads (not just within one
    already-open tab). No new RLS policy needed (same household-scoped
    `households_update_budget` UPDATE policy as `board_closed`). Per this
    repo's own established caution: application code never trusts the
    column's `CURRENT_DATE` default as an ongoing source of truth -- every
    write is an explicit `toISODate()` string computed client-side, same
    posture as `ledger_entries.doneTsIso` (Closed Gap C10). The default only
    matters for a brand-new household's very first read.
  - `task.actions.ts`'s `getBoardClosedFn` now also selects/returns
    `boardDate`; new `setBoardDateFn({ token, date })` persists it, same
    manager-only gating as `setBoardClosedFn`.
  - `use-task-board.ts`'s mount fetch now sets `simDate` from the persisted
    `boardDate` (guarded with a value-equality check inside a functional
    `setSimDate` update, since `parseISODate()` -- new in `lib/time.ts` --
    returns a fresh `Date` object every call, and an unguarded update would
    loop through `refresh`'s own `simDate` dependency). A new
    `rolloverNeededFor: Date | null` state, set by a `useEffect` keyed on
    `nowTs`/`simDate` (`toISODate(new Date(nowTs)) > toISODate(simDate)`),
    covers both real staleness scenarios with one check: a tab left open
    across a real midnight (`simDate` stays fixed in memory while `nowTs`
    ticks past it every 30s), and a multi-day-stale reload (`simDate`
    initializes from the stale persisted `boardDate` above, already behind
    on mount). `startNewDay(targetDate)` clears the flag when it actually
    runs.
  - `app-store-provider.tsx` watches `board.rolloverNeededFor`: when set, for
    a signed-in `primary`/`co` manager session only (mirrors
    `canStartNewDay`'s own gating -- a remote-only session leaves the flag
    for a real manager session to pick up rather than attempting a call the
    server's role check would 403), it runs the same `runDayRollover(target)`
    used by C30's manual path (jumping straight to *today*, not
    `simDate + 1`, so a multi-day-stale tab doesn't need N manual catch-up
    cycles), then an **info** toast (not the success one) reporting the real
    counts. A ref guard prevents re-entering while already in flight.
- **Verification:** `tsc --noEmit`, scoped `eslint`, the Vitest suite, and a
  full `vite build` all pass clean. This session had no service-role key
  (same posture as every prior migration in this file), so
  `supabase/add-household-board-date.sql` needs to be applied by hand before
  auto-rollover works live -- flagging here so the next session doesn't
  assume it's already applied, same posture as C17/C21/C27. Not yet verified
  against a live signed-in session with a real multi-day-stale board.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9-C21/C30. No realtime channel exists for `board_date`/
  `rolloverNeededFor` across devices -- if two managers have the app open on
  different devices, only the one whose `nowTs` first ticks past the
  boundary (or whose fresh load first fetches a stale `boardDate`) performs
  the rollover; the other picks up the result on its own next
  `household-board-channel` refetch, same "not instant" posture already
  accepted for `board_closed` in Closed Gap C17. **Also see Closed Gap
  C32:** the `nowTs > simDate` trigger above is pure client `Date.now()`;
  C32 gates the actual rollover fire on a server clock cross-check rather
  than leaving the client comparison unverified.

### C32. Auto-rollover (Closed Gap C31) trusted the device's own clock with no server-side cross-check (former Open Gap O2)

- **Found:** 2026-08-16, discussing hardening options for C31's
  just-shipped auto-rollover with the user, before any code was written for
  this one.
- **Root cause:** `use-task-board.ts`'s `rolloverNeededFor` effect fires a
  real, irreversible household-wide Quick Utos `DELETE` (plus
  routine-ticket inserts) purely off
  `toISODate(new Date(nowTs)) > toISODate(simDate)` -- `nowTs` is
  `clock.nowTs`, which is just the device's own `Date.now()` (ticking every
  30s, see `use-sim-clock.ts` -- now-disabled sim offset aside, it has
  always been plain client time, same as every other `nowTs`/
  `toISODate(new Date())` call site in this app). Nothing about that
  comparison was validated against anything outside the browser: a device
  clock set wrong (accidentally or deliberately) forward would trip the
  comparison immediately and fire a real delete on a false premise, with no
  undo; a misconfigured timezone would shift what "today" means locally,
  tripping the comparison a day early/late relative to the household's
  actual PH day; and nothing bounded *how far* a jump was, so a wildly
  wrong clock (stuck, epoch-adjacent, accidentally set years off) wasn't
  treated any differently from a normal one-day catch-up.
- **Decisions (user-confirmed before writing code):** reaching for
  NTP/GPS/carrier time was rejected -- NITZ is OS-only and not queryable by
  any app; NTP is UDP-based and unreachable from a browser; neither is
  worth the complexity for what's only ever a calendar-day comparison, not
  sub-second accuracy. Postgres's own clock is used instead, since it's
  infrastructure-managed (NTP-synced, not user-controllable) and it's the
  same system `board_date` is already stored in. Of the two options
  discussed for reconciling the server round trip (once per mount, inside
  `getBoardClosedFn`) against `rolloverNeededFor`'s comparison (every 30s
  `nowTs` tick) -- deriving a persistent client/server offset (like the old
  sim-clock `offsetMs`, but truth-sourced) vs. one fresh server round trip
  right before the destructive action actually fires -- the second was
  picked and scoped narrowly to the rollover trigger only: cheaper on the
  server (no continuous polling), doesn't touch `use-sim-clock.ts`'s
  `nowTs` or its other non-destructive consumers (availability status,
  Quick Utos default recipient, the friction wall), and checks the server
  at the one moment that actually matters. A sanity bound was added
  regardless of clock source, per the user's ask.
- **Fixed by:**
  - `supabase/add-server-now-function.sql` adds a `stable` SQL function
    `public.server_now() returns timestamptz` (`select now()`), granted to
    `authenticated, anon` -- same grant shape as `current_household_id()`
    in `fix-household-rls-recursion.sql`, though every real caller today is
    authenticated. No `SECURITY DEFINER` needed (no table access, unlike
    `current_household_id()`).
  - `task.actions.ts` gained `getServerNowFn({ token })`: authenticates the
    caller, then calls `.rpc("server_now")` and returns
    `{ serverNowIso: string }`. Deliberately separate from `getBoardClosedFn`
    (which still only round-trips once per mount) rather than folding the
    server day into it, since this needs a *fresh* call right before the
    rollover fires, not a stale mount-time snapshot.
  - `use-task-board.ts` gained `dismissRollover()`, a thin
    `setRolloverNeededFor(null)` wrapper -- clears the flag without running
    the rollover, for the false-positive path below.
  - `app-store-provider.tsx`'s auto-rollover effect now calls
    `getServerNowFn` before calling `runDayRollover`, still gated the same
    `primary`/`co` manager check as before:
    - If the server's own day (`toISODate(new Date(serverNowIso))`) does
      **not** exceed `simDate`, the device's clock was wrong -- this is
      treated as an expected false-positive, not an error:
      `board.dismissRollover()` clears the flag with no delete/respawn, and
      a `rejectedRolloverDayRef` throttles re-verification to once per
      distinct device-perceived day (so a device stuck on a wrong clock
      doesn't hammer `getServerNowFn` on every 30s tick -- it naturally
      resets once the device's perceived "today" changes).
    - If the server agrees, the rollover fires against the **server's**
      confirmed day (not the client's guessed one), so the two clock
      sources can never disagree about what day was actually rolled to.
    - Sanity bound: if the server-confirmed gap between `simDate` and today
      exceeds `MAX_PLAUSIBLE_ROLLOVER_DAYS` (14), auto-rollover is skipped
      entirely -- `rolloverNeededFor` is deliberately left **set** (not
      cleared) in this branch, unlike the false-positive path, so the
      per-tick effect doesn't immediately re-derive and retry it; a manager
      can still catch up manually via "Start new day" (C30), which has no
      such cap.
- **Verification:** `tsc --noEmit`, scoped `eslint` (only the same
  pre-existing CRLF/prettier noise documented in C22/C25 on unrelated
  lines, filtered out), the Vitest suite, and a full `vite build` (SSR +
  client) all pass clean. This session had no service-role key (same
  posture as every prior migration in this file), so
  `supabase/add-server-now-function.sql` was applied by the user directly
  -- confirmed live 2026-08-16 with an anonymous PostgREST
  `POST .../rest/v1/rpc/server_now`: a `200` response with a real
  `timestamptz` value, not a "function does not exist" 404. Not yet
  verified against a live signed-in session with a real clock-mismatch
  scenario (the false-positive dismiss / sanity-bound-skip paths).
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9-C21/C30/C31. Multiple managers' devices can still disagree
  about *when* to check (each ticks its own `nowTs` independently), but
  once any of them does check, the server's own day is what actually gets
  applied -- so a skewed-forward device can no longer force a false
  rollover, it can only trigger an earlier (correctly-verified) real one.
  The 14-day sanity bound is a fixed constant, not household-configurable;
  a household genuinely unmanaged for more than two weeks needs a manual
  "Start new day" click to catch up, same as before this fix for any
  jump that size.

### C33. C6's `break_start`/`break_end` columns were never propagated to `LINARA_MOBILE` -- the two apps disagreed about a helper's protected break, with pay consequences

- **Found:** 2026-08-16, while fixing a `LINARA` Shifts display bug (see C34)
  and auditing `LINARA_MOBILE` for the same class of mistake.
- **Root cause:** C6 added `helper_profiles.break_start`/`break_end`
  specifically so "the Ledger's `rest_break` classification and Availability's
  on-shift check keep working." Both consumers it named live in `LINARA`, and
  both were updated. `LINARA_MOBILE` was not: `services/api/helper-profile.ts`'s
  `.select()` omitted the two columns, `lib/availability.ts`'s `ShiftWindow`
  had no break fields, and `deriveRosaStatus` had no break concept at all.
  This is exactly the cross-repo hazard `AGENTS.md` warns about -- `LINARA`
  owns the schema, changed it, and the mobile client wasn't updated in step.
  C6's own "Known residual limitation" section didn't mention mobile, so this
  looks overlooked rather than deliberately deferred.
- **Why it mattered:** During a break window (say 12:00-13:00), the manager's
  web dashboard resolved the helper to **Off** -- the friction wall fired on
  sends, and `use-ledger.ts`'s `classify()` tagged any work done then as
  `rest_break`. The helper's own Worker's Station simultaneously showed **"On
  Shift"** (`rosa-avail-control.tsx`). The two apps disagreed about protected
  time, and that disagreement fed after-hours pay classification.
- **Fixed by:** Teaching mobile the same break window `LINARA` already knew
  about: `ShiftWindow` gains optional `breakStart`/`breakEnd`,
  `deriveRosaStatus` excludes break minutes from `onShift` (falling through to
  the manual-opt-in check exactly as web's `isMinuteInShift` -> `statusFor`
  does), `getMyHelperProfile` selects and returns the two columns, and
  `app/(app)/today.tsx` passes them through. No schema change -- the columns
  already existed and already carried the right data. Both repos typecheck
  clean.
- **Known residual limitation, not closed by this fix:** The pre-claim
  handshake path (`services/api/handshake.ts` -> the `lookup_pending_invite`
  RPC) still returns no break columns, so the review-terms screen shown before
  a helper claims their account can't display a break. That needs a SQL change
  to the RPC's return shape, and breaks aren't collected at invite time
  anyway (`invite-helper-modal.tsx` has no break inputs) -- so today there is
  never a break to show at that point. Revisit if breaks ever become part of
  the invited terms. Separately, neither app can represent a shift crossing
  midnight (`minutes >= start && minutes < end` is always false when
  `end < start`); quiet hours (22:00-06:00) mask most of that range and the
  product only models day shifts, so it stays latent.

### C34. `helper_profiles`' Postgres `TIME` columns come back as `"HH:MM:SS"`, which `LINARA`'s `parseHM` silently parsed as midnight

- **Found:** 2026-08-16, from a user report that the Schedule > Shifts row
  preview read "12:00 AM - 12:00 AM" while the expanded editor showed the
  correct times.
- **Root cause:** `src/lib/time.ts`'s `parseHM` matched `/^(\d{1,2}):(\d{2})$/`
  -- no seconds -- and returned `0` on any non-match. Supabase returns
  `shift_start`/`shift_end`/`break_start`/`break_end` (Postgres `TIME`) as
  `"HH:MM:SS"`, so every one of them parsed to minute 0. The collapsed Shifts
  row (`summarizeSchedule` -> `fmtHM12` -> `parseHM`) therefore always rendered
  midnight-to-midnight. The editor looked fine only because
  `<input type="time">` receives the raw string and parses `HH:MM:SS` natively,
  never touching `parseHM`. The same silent `0` also broke `isMinuteInShift`
  (`minutes >= 0 && minutes < 0` is never true, so every helper read as
  permanently off-shift on the Availability grid) and `use-ledger.ts`'s
  `rest_break` window check. Notably `LINARA_MOBILE` had this right all along
  -- it uses `split(":")`, which ignores the extra component, and documents the
  `"HH:MM:SS"` shape explicitly.
- **Fixed by:** Replacing `parseHM`'s regex with a `split(":")` + range-check
  parse -- deliberately the same approach `LINARA_MOBILE/lib/availability.ts`
  already used, so the two repos now agree on how a `TIME` string is read.
  This also tightened validation the regex never had: `\d{1,2}`/`\d{2}` happily
  accepted `"99:99"` and turned it into minute 6039, past the end of the day;
  out-of-range values now return 0 like any other unparseable input. (An
  interim fix that just added an optional `:SS` to the regex tripped
  `security/detect-unsafe-regex` -- a false positive, since every quantifier
  was bounded, but the split version avoids the question entirely.)
  Regression tests in `src/lib/time.test.ts` cover the Postgres shape, the
  malformed cases, and the out-of-range cases.
  A second, independent surface of the same blind spot: `use-invites.ts`'s
  `toInvite` never formatted at all, emitting a raw `"06:00:00 - 19:00:00"`
  into the People roster, the invite-code screen, and My Terms. Worse,
  `Invite.shift` was doing double duty -- a display string on the read path and
  a data carrier on the write path (`create()` recovered the times via
  `data.shift.split(" - ")`). `Invite` now carries raw `shiftStart`/`shiftEnd`
  alongside a display-only, `fmtHM12`-formatted `shift`, and `create()` takes
  the raw fields directly instead of parsing a localized string back into data.
- **Known residual limitation, not closed by this fix:** `parseHM` still
  returns `0` rather than throwing on genuinely malformed input, so a future
  format surprise degrades to midnight rather than failing loudly. Left as-is
  because several call sites treat the schedule as optional and rely on a
  non-throwing parse; a stricter version would need those audited first.

### C35. Xendit payouts were sent at 100x their value -- `v2/payouts` takes major units, not cents

- **Found:** 2026-08-16, during the Session 0 verification pass of
  `PAYMENTS_REMEDIATION.md` (a user-reported "the ~3,250 peso transaction
  became PHP 356,250.00"). The code defect itself had already been fixed
  two days earlier without a gap entry; this records it, and the residual
  data divergence it left behind.
- **Root cause:** `src/features/pay/pay.actions.ts` sent
  `amount: Math.round(netPay * 100)` -- the minor-units (centavos)
  convention used by Stripe and most card processors. Xendit's
  `POST /v2/payouts` takes a **decimal amount in major units (PHP)**, so
  every payout was requested at 100x its intended value. Introduced in
  `9d88674` (2026-08-14 05:00:45 +0800), fixed in `e1266c5`
  (2026-08-14 21:07:27 +0800) by changing it to
  `Math.round(netPay * 100) / 100`, which is now just a round-to-2-decimals
  idiom and no longer a unit conversion. Worth stating plainly so the next
  reader doesn't "simplify" it back: **the `* 100` and the `/ 100` are not
  redundant, and removing both would reintroduce unrounded floats; removing
  only the `/ 100` reintroduces this bug.**
- **Why it wasn't caught:** nothing asserts the unit anywhere. There is no
  test on the request body, the `payslips` table stores `net_pay` in pesos
  while the wire format was centavos, and Xendit accepted the request
  without complaint -- an implausibly large payout is a business decision as
  far as their API is concerned, so the only signal was the amount showing
  up wrong in their dashboard.
- **Known residual limitation, not closed by the code fix:** the one payslip
  row that exists in the live database (`helper_id e13ecc26...`, cutoff
  `2026-08-01 -> 2026-08-15`, `requested_at 2026-08-14 12:59:41+00`) was
  created **8 minutes before** the fix landed, so it is one of these. Its
  stored `net_pay` is in pesos while the payout Xendit actually received was
  100x that -- **`payslips` and Xendit's ledger disagree for this row**, and
  it was sitting in `payout_status = 'processing'` because the corresponding
  Xendit payout never reached a terminal state. Sandbox money, user-confirmed
  2026-08-16, so no real funds are exposed. **Cancelled at Xendit 2026-08-16**
  (`POST /v2/payouts/{id}/cancel` on `disb-5fae2444-...`, response
  `status: "CANCELLED"`; a read-only GET beforehand confirmed it was still
  `ACCEPTED` and thus cancellable, with `estimated_arrival_time
  2026-08-17T03:00:00Z` -- scheduled to disburse, not frozen). Re-verified by
  GET on 2026-08-16: `status: "CANCELLED"`, `amount: 356250`,
  `updated 2026-08-16T08:02:49Z`. The 100x payout will not disburse. This is a
  live instance of exactly the divergence `PAYMENTS_REMEDIATION.md`'s Session D
  reconciliation view is meant to catch.
- **Open sub-item left for the maintainer to verify in the SQL editor** (the
  app's anon key can't read `payslips` through RLS): whether the
  cancellation's `payout.failed`/`payout.reversed` callback actually flipped
  the row (`processing` -> `failed`, `confirmed_at` set) and unsettled its
  vale back to the pool. If it did **not** flip, the row stays `processing`,
  and Session A's partial unique index on
  `(helper_id, cutoff_start, cutoff_end) WHERE payout_status <> 'failed'`
  would lock the Aug 1-15 cutoff permanently -- so Session A must resolve this
  legacy row (via the planned `needs_review` path or a manual status
  correction) as part of landing that index. This is also the first
  opportunity to observe the webhook writing into `payslips` end to end (see
  next bullet).
- **Separately confirmed in the same pass:** no payslip row has **ever**
  reached `succeeded` or `failed` (Session 0 Q4 returned a single
  `processing` row and nothing else). The Xendit webhook subscription is
  correctly configured and a 10k test disbursement did succeed, but that
  disbursement was made directly against Xendit's API and has no `payslips`
  row, so `xendit-payout-webhook` writing back into `payslips` remains
  **unverified end to end**. Configuration being right is not the same as
  delivery being observed; C21 recorded the former as the open question and
  it is the latter that is still open.
- **CLOSED 2026-08-17 — the webhook is now verified end to end.** Two real
  payouts completed through the app after the C44 redeploy, and the database
  agrees with Xendit on every field that mattered:

  | helper | net_pay | amount_sent | payslip | attempt | confirmed_at |
  | --- | --- | --- | --- | --- | --- |
  | Kuya Marito | 5812.50 | 5812.50 | succeeded | succeeded | 16:43:52Z |
  | Ate Marites | 3812.50 | 3812.50 | succeeded | succeeded | 16:53:01Z |

  This settles the three things this entry left open. `record_payout_attempt_result`
  rolls an attempt up to its payslip correctly from the webhook path, not just
  from the web caller. `amount_sent` matches `net_pay` exactly on both — the
  per-attempt snapshot this entry was written for now has a clean reading, and
  the 100x class of divergence would have been visible here immediately. And
  **a successful payout does not release the vale**: Ate Marites' ₱500 kept its
  `settled_in_payslip_id`, which is the branch `record_payout_attempt_result`
  restricts to `failed`/`cancelled`.

  Kuya Marito's payout was sent at 14:42 and confirmed at 16:43 — roughly two
  hours later, consistent with **Xendit's own retry** of the delivery that C44's
  stale build had 500'd, landing once the correct build was live. If so, the
  24-hour retry window behaves as their docs claim, and a deployment fault was
  self-healing once fixed. Worth knowing before relying on it: it means a bad
  deploy costs a delay, not a lost callback.

### C36. Double-pay was reachable two ways -- a retry minted a fresh idempotency key, and the duplicate guard had no constraint behind it

- **Found:** 2026-08-16, in the `PAYMENTS_REMEDIATION.md` audit (Session A).
  **Closed:** 2026-08-16 -- `supabase/add-payslip-double-pay-guards.sql`
  applied by hand in the Supabase SQL editor by the maintainer, same posture as
  C17/C21/C27/C31.
- **Vector A (retry after an ambiguous failure):** `pay.actions.ts` minted
  `referenceId = crypto.randomUUID()` per attempt and sent it as Xendit's
  `Idempotency-key`. Every retry was therefore a *different* request to Xendit,
  so their idempotency could never collapse it. Worse, the `catch` swallowed
  **every** post-`fetch` throw as `payout_status = 'failed'` and unsettled the
  vales -- including a JSON parse error, a timeout, or a failure of the
  *follow-up status UPDATE* after Xendit had already returned 200. The manager
  saw "Failed", clicked Pay again, and a second real payout went out.
- **Vector B (TOCTOU race):** `initiate_payslip` did
  `IF EXISTS (...) RAISE` then `INSERT`, with no unique constraint behind it.
  Under READ COMMITTED two concurrent transactions both passed the `EXISTS`
  check and both inserted. The table's only `UNIQUE` was on
  `payout_reference_id`, a fresh UUID per call, so it never collided. The UI's
  `paying` state guards one component instance -- two managers, or one manager
  in two tabs, defeats it.
- **Fixed by:** `supabase/add-payslip-double-pay-guards.sql` plus
  `src/features/pay/`:
  1. **Reference id is now derived inside the RPC**, deterministically as
     `md5(helper:cutoff_start:cutoff_end)::uuid`, and a retry **reuses the
     existing row's id** -- so a retry replays the SAME Idempotency-key and
     Xendit collapses it. `pay.actions.ts` no longer mints one.
  2. **`UNIQUE INDEX payslips_one_per_cutoff (helper_id, cutoff_start,
     cutoff_end)`** -- deliberately NOT the partial
     `WHERE payout_status <> 'failed'` index `PAYMENTS_REMEDIATION.md`
     originally sketched. A failed attempt is retried by **updating the row in
     place**, never by inserting a second one, so there is only ever one row
     per cutoff. The partial-index shape is incompatible with reusing the
     reference id (the rows would collide on `payout_reference_id`, and
     `xendit-payout-webhook` -- which matches on `reference_id` -- would face
     two rows with the same id and could not tell which to update). Per-attempt
     history is deferred to Session D's `supersedes_payslip_id`.
  3. **`SELECT ... FOR UPDATE`** on the per-cutoff row, serializing two
     concurrent calls, plus a `unique_violation` handler around the INSERT so
     the loser of a concurrent-insert race gets the friendly "A payslip already
     exists for this cutoff" rather than a raw constraint error.
  4. **New `needs_review` status** for genuinely ambiguous outcomes (no
     response from Xendit, or Xendit accepted but our bookkeeping write
     failed). It does **not** unsettle vales and the RPC **refuses to retry
     it** -- only a `failed` row is retryable. `pay.actions.ts` now
     distinguishes three outcomes instead of collapsing everything into
     `failed`; see its doc comment for the taxonomy. Mirrored into
     `../LINARA_MOBILE` (`services/api/payslips.ts` `PayoutStatus`, and both
     `Record<PayoutStatus, ...>` maps in `components/features/pay/
     payslip-history.tsx`) so the helper's app renders the new status -- the
     C33 cross-repo lesson applied preemptively this time.
- **Verified against a real Postgres**, not just by reading: the migration was
  applied to a throwaway `postgres:15-alpine` container with a minimal schema
  fixture (the only failure being `role "authenticated" does not exist`, absent
  outside Supabase), re-applied twice more to prove idempotency, and then
  exercised with **two genuinely overlapping transactions** -- session A holding
  an open transaction inside the RPC while session B entered it for the same
  helper+cutoff. Result: exactly **one** payslip row; session B got the
  friendly error. Both race paths were hit independently -- the concurrent
  INSERT caught by the unique index, and the existing-row case caught by the
  `FOR UPDATE` + status guard. Also confirmed: the reference id matches
  `md5(...)` exactly, `needs_review` blocks a retry, and a `failed` row is
  retried **in place** (same row id, same reference id, count still 1, vale
  re-settled).
- **Known limitation, deliberately accepted:** reusing the reference id means a
  payout **cancelled** at Xendit can never be re-sent for that cutoff -- the
  replayed key returns DUPLICATE and the row would park in `processing` for a
  payout that isn't in flight. The escape hatch (rotate the stored reference
  id) is documented with ready-to-run SQL in the migration's header comment.
  This applies to the one pre-existing row from C35, whose reference id Xendit
  already knows as CANCELLED.
- **Still open, carried into Session B:** `initiate_payslip` continues to
  accept `p_cutoff_start`/`p_cutoff_end` from the caller, so the guard is only
  as trustworthy as `pay.actions.ts`'s (timezone-broken) arithmetic. Session B
  moves the derivation inside the function. Also unresolved: Xendit's
  idempotency **retention window** is undocumented, so the duplicate-replay
  defence is unproven past an unknown horizon, and the duplicate-detection
  match in `pay.actions.ts` (HTTP 409 or a duplicate/idempotency hint in the
  body) is defensive rather than confirmed against a real replay.

### C37. C36 conflated business idempotency with transport idempotency, making a cancelled payout unrepayable

- **Found:** 2026-08-16, immediately after C36 shipped -- the race-proof harness
  surfaced the dead end, and a review of standard payment-system practice
  confirmed the root cause was structural rather than a bug.
  **Closed:** 2026-08-16 -- both files applied by hand in the Supabase SQL
  editor by the maintainer, in the required order:
  `supabase/cleanup-c35-legacy-payslip.sql` **first** (it targets rows by
  `payslips.payout_reference_id`), then `supabase/add-payout-attempts.sql`
  (which drops that column). Re-running either is safe.
- **Root cause:** there are two distinct idempotency problems and C36 solved
  both with one mechanism.
  - **Business idempotency** -- "never create two payouts for one cutoff".
    Scope: the logical payout. Lifetime: permanent. Correct mechanism: a DB
    unique constraint. C36 got this right and it is unchanged
    (`payslips_one_per_cutoff`).
  - **Transport idempotency** -- "never let one network retry become two API
    calls". Scope: a single HTTP request. Lifetime: the PSP's retention window
    (Stripe/Adyen ~24h; Xendit's is undocumented, Session 0 Q6). Correct
    mechanism: a per-**attempt** key.

  C36 derived one key per `(helper, cutoff)` and reused it forever, which made
  a transport-scoped mechanism permanent. Two consequences: (1) a payout
  **cancelled** at Xendit could never be re-sent for that cutoff -- the
  replayed key returns DUPLICATE, so the caller marked the row `processing` for
  a payout that was not in flight, a dead end; and (2) the protection silently
  expires anyway once the PSP forgets the key, at which point reuse buys no
  deduplication while still blocking a legitimate re-send. Worst of both.
- **Fixed by** adopting the intent + attempts model that Stripe
  (PaymentIntent -> Charges), Adyen and PayPal all use:
  - **`public.payout_attempts`** (`supabase/add-payout-attempts.sql`) --
    append-only, one row per Xendit API call, each with its own UNIQUE
    `reference_id` (sent as both Xendit's `reference_id` and the
    `Idempotency-key`), `psp_payout_id`, `status`, and `amount_sent` snapshot.
    That last column is exactly what C35 lacked: a per-attempt record of what
    was actually requested, which is what makes reconciliation possible.
    RLS via `payout_attempts -> payslips -> helper_profiles`, one hop further
    out than `payslips_isolation`.
  - **`record_payout_attempt_result`** -- single place that maps an attempt
    status to a payslip status and decides vale release, called by both the web
    caller and the webhook so the two can't implement it differently.
    `cancelled` maps to payslip `failed` (the payout is definitively not
    happening, so the cutoff should be retryable); only `failed`/`cancelled`
    release vales -- never `ambiguous`, whose vales may already have been paid.
  - **`initiate_payslip` rewritten** to spawn a fresh attempt with a fresh
    `gen_random_uuid()` key. Same guards and the same `FOR UPDATE` +
    unique-index race protection as C36.
  - **`pay.actions.ts` now reconciles instead of guessing.** On no response it
    calls `GET /v2/payouts?reference_id=...` and adopts the real status; only
    if that lookup *also* fails does the attempt become `ambiguous` ->
    `needs_review`. This is the standard answer to "did the PSP get my
    request?" and it makes most previously-ambiguous sends self-resolving.
  - **`xendit-payout-webhook` resolves via `payout_attempts.reference_id`**
    rather than the dropped `payslips.payout_reference_id`, and delegates the
    rollup to the RPC. Also now handles `payout.cancelled`.
  - `payslips.payout_reference_id` **dropped** (it lives on the attempt now;
    a second copy would only drift). `payout_external_id` kept as a
    denormalized mirror of the latest attempt for the Money tab. Neither is
    selected by `../LINARA_MOBILE` and neither was in this repo's `PayslipRow`,
    so both clients are unaffected -- verified, not assumed.
- **Verified against a real Postgres**, same harness as C36: both migrations
  applied in order to a throwaway `postgres:15-alpine`, the attempts migration
  re-applied twice more to prove idempotency, then seven behavioural tests. Two
  overlapping transactions still yield exactly one payslip and one attempt;
  `accepted` -> `processing`; a retry is blocked while `processing` and while
  `needs_review`; `ambiguous` does **not** release vales; an invalid status is
  rejected. The decisive one: **`cancelled` -> payslip `failed`, vale released,
  and the retry produced attempt #2 with a brand-new reference id** -- the dead
  end C36 documented as an accepted limitation is now structurally impossible,
  with attempt #1 preserved as history.
- **Why this was worth doing now rather than later:** the database holds
  sandbox/test data only (see the environment note at the top of this section),
  so the restructure cost one deleted row instead of a data migration against
  real payroll. It also lands before Session B rewrites `initiate_payslip`
  again, so that function settles into its final shape once instead of twice.
- **Known residual limitations:** (1) the duplicate-detection match in
  `pay.actions.ts` (HTTP 409 or a duplicate/idempotency hint in the body) is
  still defensive rather than confirmed against a real Xendit replay, though it
  now matters far less since a duplicate on a per-attempt key would indicate a
  bug rather than a normal retry; (2) the shape of Xendit's
  `GET /v2/payouts?reference_id=` response is assumed to be either a bare array
  or `{data: [...]}` and should be confirmed against a real call; (3) a payslip
  still carries a rolled-up snapshot that is **mutated in place** on retry, so
  the per-attempt history is authoritative and the payslip is a cache of the
  latest attempt -- acceptable while data is disposable, and worth revisiting
  against RA 10361's retention obligation before a real household is onboarded.

### C38. Cutoff dates were derived in JS from local Date components and formatted as UTC, so client and server disagreed about "this cutoff"

- **Found:** 2026-08-16, in the `PAYMENTS_REMEDIATION.md` audit (Session B).
  **Closed:** 2026-08-17 -- `supabase/add-household-timezone-and-cutoffs.sql`
  applied by hand in the Supabase SQL editor by the maintainer.
- **Root cause:** `src/features/pay/pay.utils.ts`'s `currentCutoffRange` built
  a `Date` from **local** components (`getFullYear`/`getMonth`/`getDate`) and
  then rendered it with `toISOString()` (**UTC**). Confirmed by running the
  real function under three zones:

  | `TZ` | `Aug 10 04:00Z` | `Aug 16 04:00Z` |
  | --- | --- | --- |
  | `UTC` | `08-01..08-15` ok | `08-16..08-31` ok |
  | `Asia/Manila` | `07-31..08-14` **bad** | `08-15..08-30` **bad** |
  | `America/Los_Angeles` | `08-01..08-15` ok | `08-01..08-15` **wrong half** |

  The bug is **one-directional** -- only positive UTC offsets shift, because
  local midnight renders to the *previous* day in UTC. `Asia/Manila` (UTC+8) is
  exactly the broken case; negative offsets were correct by accident. (An
  earlier draft of `PAYMENTS_REMEDIATION.md` claimed LA shifted too -- it does
  not, and that has been corrected in place.)
- **Two consequences beyond the off-by-one**, neither in the original writeup:
  1. **Month-end was truncated.** In Manila, `16 -> EOM` on a 31-day August
     produced `2026-08-15..2026-08-30`. **August 31 fell into no cutoff at
     all** -- a day of work that no payslip could ever cover.
  2. **The cutoff *bucket* flipped, not just the formatting** (the LA column
     above selects the first half on the 16th, because the day-of-month
     comparison driving the branch is itself timezone-dependent). So this could
     never have been fixed by correcting `isoDate` alone.
- **Why it mattered in practice:** the same function ran on **both** sides --
  the server wrote `cutoff_start`/`cutoff_end`, the browser looked the current
  cutoff up. Session 0 confirmed the server ran UTC (Vercel's Node default), so
  stored dates were right *by accident* while the Manila browser searched for a
  cutoff one day off, never matched, and therefore **kept showing "Pay via
  GCash/Maya" immediately after a successful payout**. That is what invited the
  second click that C36/C37 now prevent structurally. Verified against the real
  data: the one payslip stored `2026-08-01..2026-08-15` for a payout requested
  at `2026-08-14 20:59 +08`, which is what UTC produces and Manila does not.
- **Fixed by** moving every persisted/compared calendar day onto Postgres's
  clock, in an explicit household timezone -- the same frame as `server_now()`
  (C32) rather than a second source of truth:
  - **`households.timezone`**, defaulting to `'Asia/Manila'`. A real column
    rather than a hardcoded constant: it cost nothing while there is one
    household and no real payroll, and avoids a migration against live payroll
    later. `household_timezone()` degrades to `'Asia/Manila'` on an
    unrecognized IANA name rather than letting `AT TIME ZONE` raise, because on
    this path a raise means payroll stops.
  - **`household_today()`** -- the household's civil date, server-side.
  - **`cutoff_bounds_for(day, interval)`** (IMMUTABLE, so it is directly
    testable without mocking a clock) and **`household_cutoff(interval)`**.
    Month lengths and leap Februaries come free from date arithmetic instead of
    being hand-rolled.
  - **`initiate_payslip` derives its own cutoff** from the helper's own
    `payday_interval` and no longer accepts `p_cutoff_start`/`p_cutoff_end`.
    Previously the double-pay guard was only as trustworthy as
    `pay.actions.ts`'s (broken) arithmetic -- a caller computing the wrong
    cutoff would have sailed straight past `payslips_one_per_cutoff` by
    inserting under the wrong key.
  - **`currentCutoffRange` deleted.** `pay.utils.ts` now holds display
    formatting only, with a header explaining what not to reintroduce, and
    `pay.utils.test.ts` asserts the module exports nothing else.
    `useHouseholdCutoff` reads the RPC instead -- deliberately keyed on the
    **selected** helper's interval rather than living beside `usePayslips` in
    the provider, since `payday_interval` is per-helper and the Money tab has a
    switcher (the `MULTI_HELPER_HANDLING.md` failure mode). While the cutoff is
    unknown the Pay buttons stay hidden rather than rendering on a guess.
  - **C32's remaining hole closed in the same pass:** `getServerNowFn` now also
    returns `householdToday`, and `app-store-provider.tsx` uses it instead of
    `toISODate(new Date(res.serverNowIso))` -- which took a trustworthy server
    *instant* and rendered it to a day in the **browser's** timezone, so a
    device with a right clock but a wrong timezone still derived the wrong day
    from a correct answer.
  - **Mirrored in `../LINARA_MOBILE`** (`services/api/cutoff.ts`, consumed by
    `DigitalPayslip` via `app/(app)/pay.tsx`), which previously showed no cutoff
    dates at all. It reads the same RPC rather than gaining a third independent
    copy of the rule. Note this corrects the premise in
    `PAYMENTS_REMEDIATION.md` that mobile "computes its own cutoff estimate" --
    it computes its own *amount* estimate and had no date logic.
- **Verified against a real Postgres**, same harness as C36/C37: all three
  payments migrations applied in order to a throwaway `postgres:15-alpine`, the
  new one re-applied for idempotency, then boundary tests. Every asserted
  boundary exact (31-day month end, 30-day, 28-day Feb, **29-day leap Feb**,
  and the 15th/16th split); **every one of 2026's 365 days and 2028's 366 days
  falls inside its own cutoff for both intervals** (the check that would have
  caught the orphaned Aug 31); consecutive cutoffs are contiguous across
  2026-2028 with **zero gaps or overlaps**; the bogus-timezone fallback works;
  and `initiate_payslip` derived `2026-08-16..2026-08-31` on its own, matching
  `household_cutoff` exactly -- where the old JS would have produced
  `08-15..08-30`.
- **Known residual limitation:** `households.timezone` has no UI -- it is a
  column with a default and no way for a manager to change it. Fine while every
  household is in PH; needs a settings surface before that stops being true.

### C39. Rest-owed hours were shown in the Pay Dial as pesos, never paid, and had no way to be taken as time either

- **Found:** 2026-08-16, in the `PAYMENTS_REMEDIATION.md` audit (Session C).
  **Closed:** 2026-08-17 -- `supabase/add-rest-off-requests.sql` applied by
  hand in the Supabase SQL editor by the maintainer.
- **Product decision that unblocked it (user, 2026-08-16):** after-hours work
  is **time, not money**. "Live-in kasambahay are not paid hourly overtime the
  way an office worker is... off-hours work is balanced by rest owed (time off
  in lieu); the after-hours balance accrues in hours/minutes of rest, not
  pesos." The kasambahay requests a date + time range, the manager approves,
  and the minutes are debited. **Cash treatment of rest-day premium is
  explicitly deferred** pending a separate policy decision.
- **What was wrong:** `spend-and-payday.tsx` computed
  `restOwedEarnings = (totalMin - premiumMin) / 60 * 120` and added it into
  `netPay`. Three separate defects in one expression:
  1. **It was never paid.** `initiate_payslip` does not read `ledger_entries`
     at all, so the Pay Dial promised money no payout ever contained.
     `../LINARA_MOBILE`'s `DigitalPayslip` omitted it, matching the real payout
     — so the helper saw the accurate number and the manager an inflated one.
  2. **The rate was invented.** `restOwedRate = 120` was a bare literal with no
     relationship to anyone's wage, and **no hourly-rate derivation exists
     anywhere in the codebase**. At the ₱6,000 regional minimum, the standard
     PH divisors (÷26 ÷8) give ≈₱28.85/hr — so the dial overstated by roughly
     **4x**.
  3. **It was inverted.** It monetized the `rest_owed` minutes — exactly the
     ones owed back as *time* — while silently dropping the `premium_pay`
     minutes, which are the only ones any cash policy would ever have covered.
- **Fixed by:**
  - **Pay Dial de-monetized.** `netPay = base - statutory - vales`, matching
    what `initiate_payslip` actually writes and what mobile shows. Rest owed is
    rendered as **time** (`fmtHoursMinutes`), outside net pay.
  - **`public.rest_off_requests`** — the redemption path that never existed.
    Helper requests a `rest_date` + `[start_time, end_time)`; a manager
    approves; approved minutes debit the balance. `minutes` is denormalized at
    request time (same snapshot reasoning as `payslips.base_pay` / C10).
    Partial unique index so only *approved* rows are unique per window — a
    declined slot may be re-requested.
  - **`rest_owed_balance_minutes(helper)`** — one definition of the balance,
    read by the manager's dashboard, the helper's app, **and** the approval
    guard, so the three cannot drift. That is the decision's "surfaced to both
    sides as the same number" requirement made structural rather than
    conventional.
  - **`request_rest_off` / `decide_rest_off_request`** RPCs, manager-gated on
    the decide side, with the balance re-checked at approval time.
  - Manager UI: `RestOffRequests` on the Money tab. Helper UI:
    `RestOffRequestForm` on the My Pay tab, plus `RestOwedCounter` switched to
    show the **redeemable balance** rather than raw accrual, so it equals the
    manager's figure.
- **Judgement call worth revisiting when the cash policy lands:** both apps
  previously excluded `premium_pay` entries from the rest-owed counter on the
  assumption they would be paid in cash — but nothing has ever paid them, so
  those minutes accrued to *nothing*. `rest_owed_balance_minutes` therefore
  **counts them**, since otherwise rest-DAY work (the kind the decision calls
  out as mattering most) would earn strictly less than ordinary off-shift work.
  They stay tagged `premium_pay`, so a future cash policy converts only the
  **unsettled** ones. Search `COUNT_PREMIUM_AS_REST` in the migration to change
  this.
- **Verified against a real Postgres**, same harness as C36-C38, and it
  **caught two real bugs in the first draft**:
  1. `request_rest_off`'s OUT parameter `minutes` collided with
     `rest_off_requests.minutes`, so `SUM(minutes)` raised "column reference is
     ambiguous" and the function failed *every* call. Renamed to
     `requested_minutes` (and `status` → `resulting_status` on the decide side)
     with every body query alias-qualified.
  2. **The overdraw guard did not work.** The first draft locked the *request*
     row (`FOR UPDATE OF r`), but two managers approving two *different*
     requests lock different rows and never contend — so 240 minutes of balance
     approved two 240-minute requests, and the `GREATEST(0, ...)` floor then
     **hid** the overdraw by clamping the display to zero. Fixed by locking the
     **helper** (`helper_profiles ... FOR UPDATE`), the actually-contended
     resource. Re-tested: one approval succeeds, the other is refused with
     "Not enough rest owed to approve: 0 minutes available, 240 requested",
     exactly one approval lands, and the balance never goes negative.
  Ten checks in total also cover: pending requests not debiting, over-requesting
  refused, double-decide refused, decline recording its reason without touching
  the balance, non-managers refused, zero-length and inverted windows refused,
  and the balance flooring at zero under a large negative `adjust_minutes`.
- **Known residual limitations:** the mobile request form takes date and time
  as typed text (`YYYY-MM-DD` / `HH:MM`) rather than native pickers — it
  validates shape and balance, but a picker would be kinder; `rest_date` is not
  validated against the household timezone's today, so a helper can request a
  past date; there is no cancel path for a pending request (the `cancelled`
  status exists but nothing sets it); and nothing checks a requested window
  against the helper's actual shift or an existing approved window on the same
  day.
- **All four resolved.** Three closed 2026-08-17/18 by
  `supabase/add-rest-off-validation.sql` (Session E item E3a) — see **C47**. The
  native-picker one closed 2026-08-18 (E3b) — see **C49**. The shift check was
  deliberately **declined** rather than deferred; reasoning in C47.
- **Open gap this exposed, NOT closed here:** `home-management-concept.md` says
  "keep the resolution type flexible per worker: a live-out day helper leans
  back toward an hourly/OT model, while a live-in accrues rest owed."
  `helper_profiles.employment` ('live-in' / 'live-out') exists and is collected
  at invite time, but the rest-vs-premium default is still
  `useState<LedgerResolution>("rest")` in `use-ledger.ts` — **ephemeral client
  state, household-wide, reset on reload, and not keyed to a helper at all**.
  So the per-worker flexibility the concept describes is not real yet. Closing
  it means persisting a default (most naturally a
  `helper_profiles.default_resolution` column seeded from `employment`) and
  having `recordLedgerEntryFn` read it per helper instead of taking whatever
  the UI's shared toggle happens to be set to. Left open deliberately: it only
  becomes load-bearing once the premium/cash path exists, which is itself
  deferred — but it is worth doing in the same pass as that decision, not
  after.

### C40. Xendit's actual API and webhook behaviour had never been observed -- three parsing branches in the payout path were documented guesses, and one was based on a wrong reading

- **Found:** 2026-08-16 as residual limitations of C35/C36/C37, gathered as
  Session E item E1 in `PAYMENTS_REMEDIATION.md`. **Partially closed:**
  2026-08-17 by running real payouts against the sandbox. Full evidence, with
  raw request/response bodies, is in
  [`E1_XENDIT_VERIFICATION.md`](E1_XENDIT_VERIFICATION.md); the maintainer's
  captures are in [`E1_XENDIT_VERIFIED.md`](E1_XENDIT_VERIFIED.md).
- **Why it mattered:** C35, C36 and C37 each shipped a defensive branch written
  from documentation rather than observation, and each note said so. Defensive
  code that has never met the thing it defends against is not a safety margin,
  it is an untested path in the one part of the app that moves money.
- **What was observed** (two ₱100 sandbox payouts, one settling, one forced to
  fail with the `123456` test account number):
  1. **`GET /v2/payouts?reference_id=` always returns an object**,
     `{"has_more":false,"data":[…]}` — never a bare array. `lookupXenditPayout`
     had accepted both; the array branch was dead code and is now gone.
     An **unknown** reference returns **HTTP 200 with an empty `data`**, not a
     404, so a miss arrives as `rows.length === 0` rather than through the
     `!res.ok` guard — which is what makes it resolve to `ambiguous` ->
     `needs_review` as designed.
  2. **A replayed `Idempotency-key` behaves conditionally on the payload:**
     identical payload -> **HTTP 200 carrying the ORIGINAL payout object with
     its CURRENT status**; different payload -> **HTTP 409,
     `error_code: "DUPLICATE_ERROR"`**. **This contradicted our own Session 0
     Q6 finding**, which recorded the 409 case unconditionally and is now
     corrected in place in `PAYMENTS_REMEDIATION.md`. The practical consequence
     is the opposite of what that note implied: a network retry resolves
     through the ordinary 2xx path and the duplicate branch is only ever a bug
     signal, exactly as C37 predicted it would become once keys went
     per-attempt.
  3. **`pay.actions.ts`'s duplicate test was correct as written** — really 409,
     really a matching `DUPLICATE_ERROR` string. Kept unchanged, with the
     comment promoted from guess to verified. Deliberately still a
     `409 OR substring` test, not an equality check: Xendit's payouts guide
     documents the same condition under the name `DUPLICATE_PAYOUT_ERROR`, so
     the literal is not stable across their own surfaces.
  4. **The webhook envelope matches what `xendit-payout-webhook` parses**, field
     for field: top-level `event` (`payout.succeeded` / `payout.failed`),
     `data.reference_id`, `data.id`, and `data.failure_code` present on failure
     only. No parser change needed. Also noted: the top-level `created` is the
     *event's* timestamp while `data.created` is the *payout's* — 80s apart on
     the success, 3.5 min on the failure. Nothing reads them today; E5's
     reconciliation view will need the right one.
  5. **Test mode settles in ~80 seconds**, not at the advertised
     `estimated_arrival_time` (+15 min), and **simulated failures are
     asynchronous** — `account_number: "123456"` returns `200 ACCEPTED`,
     indistinguishable from a good payout, and only becomes
     `FAILED`/`TEMPORARY_TRANSFER_ERROR` minutes later via webhook.
- **One behaviour change this justified, not just comments:** on a 2xx,
  `pay.actions.ts` now adopts the response body's own `status` through
  `attemptStatusFromXendit` instead of unconditionally recording `accepted`.
  Normally identical (ACCEPTED/REQUESTED -> `accepted`), it matters on a replay
  of an already-settled payout, which would otherwise park the payslip in
  `processing` waiting for a webhook that had already been and gone.
- **Cross-repo:** none required. `../LINARA_MOBILE` contains no Xendit request
  or response parsing at all — it reads `payslips` rows only. Checked, not
  assumed (the C33 lesson).
- **The headline item of C35 was NOT closed by this — and then was, later the
  same day.** Both probes here deliberately used a reference id with no
  `payout_attempts` row, so they exercised delivery and parsing but not the
  rollup. Running the real payout (runbook step 2) is what found C44, the stale
  deployment; after that redeploy two real payouts completed end to end and C35
  is closed. See C35's own closing note for the figures.
- **Still unobserved, and carried forward:** `payout.reversed` /
  `payout.cancelled` (neither fires in a normal flow — C37's cancel → `failed`
  → retryable path is Docker-verified only); `pay.actions.ts`'s
  synchronous-rejection branch, which no simulation account number reaches
  (it needs an outright refusal such as insufficient balance); and **Xendit's
  idempotency retention window**, still undocumented and unanswered by support.
  None of these block the payout path; all three are defensive branches that
  work by construction rather than by observation.
- **All three probed 2026-08-18** — runbook steps 5–7 in
  `E1_XENDIT_VERIFICATION.md`. Two are now answered further than "unobserved",
  and one guess above is **wrong**:
  1. **`payout.cancelled` is not reachable in the sandbox at all.** Cancel was
     refused **1.2s** after creation with
     `CANCELLATION_NOT_ALLOWED — already been processed by Xendit`. The window
     is effectively zero, not "short" — the 3.5 min in observation 5 above is
     how long the *failure* takes to surface, not how long the payout stays
     cancellable. So this branch can only ever be exercised by a **synthetic
     webhook replay** against our own endpoint until a real production
     reversal occurs. That test is worth running, but it verifies **our
     handler, not Xendit's envelope** — the same distinction that made C44
     invisible, and it must be logged that way rather than closing this bullet.
  2. **The synchronous-rejection trigger is found, and it is not insufficient
     balance** — that guess above is wrong twice over: `GET /balance` returns
     `REQUEST_FORBIDDEN_ERROR` on both sandbox keys, and ₱99,999,999 was
     accepted, so test mode does not check balance. Three real HTTP 400s do
     reach it: `CHANNEL_CODE_NOT_SUPPORTED_ERROR` (not app-reachable, the
     channel is a UI enum), `MINIMUM_TRANSFER_LIMIT_ERROR` at `amount: 0`, and
     `API_VALIDATION_ERROR` for an `account_number` failing `/^\d+$/` — the
     last is app-reachable through `helper_profiles.phone` and is the route to
     use. None is a 409, so `isDuplicate` cannot mis-catch them. **The app-side
     run is still pending**; only Xendit's half is observed.
  3. **The retention window is `> 25.13h`** — a replay at that age returned
     HTTP 200 with the *original* payout id. Lower bound only; support still
     unanswered. Two ladder keys were seeded 2026-08-18 to bracket it further.
     Incidental but useful: a **reconstructed** request body was accepted as
     identical, so only the reference id needs preserving, not the exact bytes.
- **A fourth item, adjacent and also unrun:** step 3 of the runbook (the
  failure rollup *through the app*) still has an empty `Observed` block. Both
  post-redeploy payouts succeeded, so `failed` → vale release → retry has never
  been exercised outside Docker either. Not part of C40's original three, but
  the same class of gap and it shares step 6's setup — do them together.

### C41. The Pay Dial, the helper's payslip and the real `net_pay` agreed only by construction -- nothing stopped a fourth term being added to one of them

- **Found:** 2026-08-17, as Session E item E4 in `PAYMENTS_REMEDIATION.md`.
  **Closed:** 2026-08-17, code and tests only — **no migration, nothing to
  apply**.
- **What was wrong:** C39's stated acceptance criterion was that the manager's
  Pay Dial, `../LINARA_MOBILE`'s `DigitalPayslip`, and the `net_pay` written by
  `initiate_payslip` agree for the same helper and cutoff. They did — but
  because the peso line had been *deleted* from one of three independently
  hand-written copies of the same expression. Nothing asserted the agreement,
  and C39's own history is the argument for why that is not enough: the Pay
  Dial had carried an invented ₱120/hr term for months while the other two did
  not.
- **Fixed by** `src/features/pay/net-pay.ts` — one definition of
  `net = max(0, base - statutory employee share - unsettled approved vales)`,
  consumed by both in-repo copies (`spend-and-payday.tsx` and
  `pay.actions.ts`). The invariant is enforced by the **signature**: there is no
  parameter through which a rest-owed total could be passed.
- **The other two surfaces are in languages this suite cannot import**, so
  `net-pay.test.ts` pins them by reading their source: `initiate_payslip`'s
  `GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total)` and the
  absence of any `ledger_entries` reference in it; the Pay Dial still rendering
  rest owed through `fmtHoursMinutes` and never multiplying it by a rate; and
  `DigitalPayslip`'s matching expression. Crude on purpose — a comment does not
  fail a build.
- **Two things the test itself caught, worth recording:** (1) the first run
  failed on `spend-and-payday.tsx`'s *comment*, which deliberately quotes the
  deleted `restOwedEarnings` expression as history — the guards now strip
  comments before matching, so they fail on the code coming back, not on the
  record of it having gone; (2) each guard was verified to actually match a
  synthetic reintroduction, since a regression test that cannot fail is worse
  than none.
- **Known limitation:** the mobile assertion **skips** when
  `../LINARA_MOBILE` is not checked out beside this repo — which is exactly the
  case in CI. `LINARA_MOBILE` has **no test runner at all** (verified
  2026-08-17: no jest/vitest, no test script, no `*.test.ts`), so today this is
  the only place the check can live. Adding one there is a real decision with
  its own scope, deliberately not taken unilaterally in this pass.

### C42. The rest-vs-premium default was one household-wide toggle in React state, so in a two-helper household it classified the wrong worker's off-shift work

- **Found:** 2026-08-16 as the open sub-item of C39; picked up as Session E
  item E2. **Closed:** 2026-08-17 — `supabase/add-helper-default-resolution.sql`,
  applied by hand in the Supabase SQL editor by the maintainer.
- **REVISED hours later, and the revision is applied too:**
  `supabase/fix-resolution-default-to-rest.sql`, run by the maintainer
  **2026-08-18**. The first version derived `premium_pay` from
  `employment = 'live-out'`; that mapping is gone, and every helper without an
  explicit choice now defaults to `rest_owed`. Reasoning is under "Why the
  employment mapping was removed" below. Both files must be run in order on a
  database that only has the first; on a fresh one the revised original is
  sufficient and the fixer is a no-op.
- **What the concept doc promised:** `home-management-concept.md` —
  *"keep the resolution type flexible per worker: a live-out day helper leans
  back toward an hourly/OT model, while a live-in accrues rest owed."*
- **What the code did:** `useState<LedgerResolution>("rest")` in `use-ledger.ts`,
  surfaced as a **"House default"** toggle on the Money tab. Ephemeral (reset on
  every reload), household-wide, and not keyed to a helper — while the card it
  sat in was *already* filtered to one selected helper. In the sandbox's
  two-helper household that meant a manager could look at Kuya Marito's ledger,
  flip the toggle, and change how **Ate Marites'** next completion was
  classified. `helper_profiles.employment` ('live-in'/'live-out') has existed
  and been collected at invite time the whole while, unused for this.
- **Fixed by:**
  - **`helper_profiles.default_resolution`** — nullable. NULL is a real state
    meaning *"follow this helper's employment"*, not a missing value.
  - **`helper_profiles.effective_resolution`** — a STORED generated column,
    `COALESCE(default_resolution, 'rest_owed')`. One definition, read by the
    trigger, the manager's web app and the helper's app alike — the same posture
    as `rest_owed_balance_minutes` (C39) and `household_cutoff` (C38).
  - **A `BEFORE INSERT` trigger on `ledger_entries`** filling an omitted
    `resolution_type` from that column, so the rule belongs to the database
    rather than to one of two clients. `insertLedgerEntryFn` now omits the field
    entirely; an explicitly-passed value still wins, which is the per-entry
    override the manager already had on each row.
  - **`set_helper_default_resolution`**, manager-gated inside the function.
    Necessary, not ceremonial: `helper_profiles_isolation` is `FOR ALL` across
    the household, so without an RPC a **helper** could rewrite her own terms of
    employment by writing the table directly.
  - The Money tab's toggle is now **"<Helper>'s default"**, persisted, and says
    which of the two states it is in ("Following employment type" vs "Set for
    this helper · tap again to follow employment").
- **Why nullable rather than a seeded snapshot:** seeding would have frozen
  whatever was true at migration time and required repeating for every new
  helper via yet another trigger. A live derivation cannot drift.
- **Why the employment mapping was removed, hours after it shipped**
  (`supabase/fix-resolution-default-to-rest.sql`): the maintainer asked why
  `premium_pay` featured at all, given rest-day premium is deferred. Following
  that through: since C39 both tags behave **identically** — both accrue into
  the redeemable rest balance and are taken as time off — so deriving
  `premium_pay` from `employment` changed nothing today. What it did change is
  tomorrow. `rest_owed_balance_minutes` is pool arithmetic,
  `SUM(entries) - SUM(approved rest_off_requests.minutes)`, with **no per-entry
  settlement marker**. Once minutes are redeemed as time off, the individual
  entries still look untouched and still carry their tag. C39 anticipates a
  future cash policy converting "only the unsettled `premium_pay` ones", but
  *unsettled* is **not answerable per entry** — so auto-tagging grew the
  ambiguous population from roughly nothing to every live-out helper's entire
  history: minutes a later cash policy could pay for a second time, after they
  had already been taken as days off. The default is now `rest_owed` for
  everyone and the premium tag is only ever a human decision. "Flexible per
  worker" is unchanged — it is simply never *implied*.
- **Open sub-item this exposed, NOT closed:** there is **no per-entry
  settlement** for rest owed. `rest_off_requests` debits a pool; nothing records
  which `ledger_entries` those minutes came from. While everything resolves as
  time this is harmless — the balance is correct either way. It becomes
  load-bearing the moment any cash conversion exists, and it should be settled
  *with* that policy rather than retrofitted after premium-tagged minutes have
  accumulated. Related: `vales.settled_in_payslip_id` is the pattern to copy.
- **Verified against a real Postgres**, same harness as C36–C39, and re-verified
  after the revision along **both** paths that now exist: a fresh database
  running only the revised original, and a database that ran the ORIGINAL and
  then the fixer — which is the live project's path. On the latter the live-out
  helper flipped `premium_pay` → `rest_owed` while an explicitly-set helper kept
  her choice, the fixer was a no-op on re-run, and the trigger, the RPC and the
  per-entry override all still worked after the generated column was dropped and
  re-added (Postgres 15 cannot `ALTER` a generated expression). The fixture had a
  live-in, a live-out, a NULL-employment helper and a pre-existing ledger row;
  the migration was applied and **re-applied twice** (clean); **12 behavioural
  checks**
  covering per-helper defaulting, explicit override, history left untouched, the
  manager gate, the helper refusal, unauthenticated refusal, a bogus value, a
  cross-household write, employment-change behaviour, and no row left with a
  NULL `resolution_type`. Plus an **overlapping-transaction check**: an insert
  running while another session holds an uncommitted default change does **not
  block** (278ms), reads the last committed value, and picks up the new one
  after commit — correct READ COMMITTED behaviour rather than a lock stall.
- **Cross-repo (this is the part that mattered):** `../LINARA_MOBILE`'s
  `restOwedMinutes` **excluded** `premium_pay` entries, with a comment claiming
  *"Premium-pay entries are paid in cash instead"* — which was never true and
  which C39 explicitly reversed. Postgres's `rest_owed_balance_minutes` counts
  them (`COUNT_PREMIUM_AS_REST`), so the two disagreed. It is used as the
  fallback shown while the authoritative balance query is in flight, and **E2
  would have made it systematically wrong**: a live-out helper's entries now
  default to `premium_pay`, so she would have seen a flat zero rest owed before
  the real number arrived. Fixed to count every entry, with the divergence that
  remains (it does not subtract redeemed minutes) stated in the comment. Exactly
  the C33 failure mode, caught in the same pass this time.
- **Known limitations:** the toggle is only on the Money tab (there is no
  per-helper settings surface in People yet); and `employment` itself has no UI
  after invite time, so a live-in → live-out change still needs SQL.

### C43. LINARA_MOBILE had no test runner, so a cross-repo invariant could only be checked from LINARA — where it skipped in CI

- **Found:** 2026-08-17 while closing E4 (C41). **Closed:** 2026-08-17, by
  maintainer decision to add one rather than leave the gap recorded.
- **The problem:** C41's guard on the helper-facing payslip formula lived in
  `LINARA`'s suite and read `../LINARA_MOBILE`'s source across the repo
  boundary. That only works where both repos are checked out side by side —
  it skipped in CI, which is precisely where a regression would land unnoticed.
- **Fixed by** adding `vitest` to `../LINARA_MOBILE` (dev dependency, `test` and
  `test:watch` scripts) and extracting `lib/net-pay.ts` — the same rule as
  LINARA's `net-pay.ts`, pulled out of `digital-payslip.tsx` so it can be tested
  without rendering React Native. `lib/net-pay.test.ts` asserts the arithmetic,
  the zero floor, the cutoff division, and (by arity) that no ledger term can be
  passed in. LINARA's cross-repo check remains as a second line of defence,
  now also asserting the component still routes through the shared function.
- **Deliberate omission, worth knowing:** the mobile suite does **not** read any
  file from disk. Doing so needs `node:fs`, which needs `@types/node`, which
  would put Node's globals into a React Native app's typecheck (where
  `setTimeout` and friends have different types) for a test-only convenience.
  The source-reading guards stay in LINARA, which already runs in Node.
- **Was still true, closed 2026-08-18:** the two repos each hand-write
  `computeStatutorySplit`, and nothing asserted the copies agreed — a divergence
  would put the manager and the helper on different deductions for the same
  wage, the same class of bug C41 closed one level up. Now pinned twice, because
  the two guards catch different mistakes:
  1. **A mirrored value table** in `people.utils.test.ts` and
     `../LINARA_MOBILE/lib/statutory.test.ts`, including the ₱5,000 boundary
     (₱5,000 exactly is *not* "under", which is the one place an off-by-one
     hides). Catches a change made without updating that repo's own test.
  2. **A direct comparison of the two function bodies**, comments stripped and
     whitespace collapsed. Catches the likelier case — someone updates a rate
     *and* the test beside it, and never opens the other repo.

  Mobile's copy moved to `lib/statutory.ts` (re-exported from
  `legal-contribution-split.tsx`, so nothing else changed) purely so it could be
  tested without rendering React Native — same move as `lib/net-pay.ts` in C43.
  **Both guards were mutation-tested**: raising the SSS employee rate on the
  mobile side alone fails the body comparison here *and* mobile's own value
  table. Note the body comparison skips when the sibling repo is absent, so CI
  relies on the value tables; that is why both exist.

### C44. The deployed `xendit-payout-webhook` was a pre-C37 build querying a dropped column, so every payout since 2026-08-16 would have hung in `processing` forever

- **Found:** 2026-08-17, on the first real payout run through the app — Session E
  item E1's step 2, the check C35 had been waiting on. **Closed 2026-08-17:**
  the committed source was redeployed, after which two real payouts completed
  end to end (figures in C35's closing note). The stuck payslip resolved about
  two hours after its failed delivery, consistent with Xendit's own 24h retry
  landing on the corrected build rather than needing a manual reconciliation.
- **The evidence**, from the Supabase function log, on a payout Xendit had
  already settled successfully:

  ```
  [xendit-payout-webhook] Lookup failed: column payslips.payout_reference_id does not exist
  ```

- **Root cause:** C37 (`add-payout-attempts.sql`, applied 2026-08-16) **dropped**
  `payslips.payout_reference_id` and rewrote the webhook to resolve the incoming
  `reference_id` against `public.payout_attempts` instead. The migration was
  applied. The rewritten function was committed. **It was never deployed.** The
  build serving the live URL was still the pre-C37 one, so every callback threw,
  returned 500, and left the payslip in `processing` while Xendit's ledger said
  `SUCCEEDED`.
- **Why it stayed hidden for a day:** nothing else calls this function, and no
  payslip had ever reached a terminal state — which C35 recorded as the open
  question and E1 existed to answer. The Session 0 / E1 pre-flight confirmed the
  *configuration* (URL correct, token set, `payout.succeeded`/`failed`/`reversed`
  subscribed) and every one of those was right. **Configuration being correct
  says nothing about which build is answering.** E1's step 1E — read the function
  logs after a probe — was the check that would have caught it a day earlier,
  and it was the one part of step 1 that was skipped; the two probe deliveries
  had thrown this same error unnoticed.
- **Fixed by** redeploying the committed source:
  `supabase functions deploy xendit-payout-webhook --project-ref <ref> --no-verify-jwt`.
  The stuck payslip is resolved either by a Xendit retry (they retry an
  unacknowledged webhook for 24h, so the 500'd delivery is still queued) or by
  calling `record_payout_attempt_result` by hand — deliberately the same
  function the webhook calls, so a manual reconciliation cannot produce a
  different result from an automatic one.
- **`--no-verify-jwt` is not optional and is now written down.** Supabase's
  gateway verifies a Supabase JWT by default; Xendit sends none, authenticating
  instead with `X-CALLBACK-TOKEN`. A redeploy without the flag would have
  rejected every callback with a 401 **before** the function ran — no function
  log at all, indistinguishable from "Xendit never called". There was no
  `supabase/config.toml` in the repo, so this requirement lived nowhere;
  `supabase/config.toml` now pins `verify_jwt = false` for this function.

### C45. Nothing tracks which Edge Function build is actually deployed, and there is no deploy step in the workflow

- **Found:** 2026-08-17, generalizing from C44 — that bug is one instance of a
  category. **Open.**
- **What's missing:** migrations have a documented, deliberate hand-run process
  (AGENTS.md, PAYMENTS_REMEDIATION.md's working agreement) and every applied one
  is recorded in this file with a date. Edge Functions have **no equivalent** —
  no deploy step in any story or checklist, no record of what was last pushed,
  and no way to compare `supabase/functions/*` against what is live. Code can
  therefore be written, reviewed, committed, and never reach production, with
  nothing failing loudly. C44 is exactly that, and it sat live for a day on the
  path that moves money.
- **Blast radius:** seven functions — `xendit-payout-webhook`, `generate-sop`,
  `simplify-sop`, `route-utos`, `parse-scheduler`, `transcribe-notes`,
  `promote-voice-task`. **Only the webhook has been verified as current
  (2026-08-17).** The other six are of unknown vintage; any that changed since
  their last deploy are silently stale in the same way. Their per-function
  `verify_jwt` state is likewise unrecorded — `config.toml` currently pins only
  the webhook, because that is the only one whose correct value is known.
- **Partially addressed 2026-08-17** — the repo side is built, the operational
  side still needs one run:
  - `supabase/config.toml` now pins `verify_jwt` for **all seven** functions,
    not just the webhook. The six client-called ones read an `Authorization`
    header and serve CORS (verified by inspection), so `true` is right for them;
    the webhook authenticates its caller with `X-CALLBACK-TOKEN` and must stay
    `false`. Written out explicitly even where it matches the CLI default,
    because C44 happened when a deployment detail lived in someone's memory.
  - `npm run deploy:functions` deploys **all** functions with those settings, so
    nobody has to remember `--no-verify-jwt` — passing it by hand is now the
    wrong thing to do.
  - `supabase/DEPLOYMENTS.md` is the missing counterpart to how migrations are
    recorded here: how to deploy, what to verify afterwards, which secrets exist,
    and a log of what was deployed when.
- **Still open:** the other six functions have **never been deployed from a
  known commit** and remain of unknown vintage. Redeploy all seven once and log
  it, so "committed" and "deployed" are known equal on a date. Better still,
  deploy from CI on merge, which removes the human step that failed here
  entirely.
- **Related:** C21 recorded the webhook's *configuration* as the open question
  and treated it as settled once the dashboard was right. C44 shows that was
  never the whole question.

### C46. Statutory contributions are deducted from every payslip and remitted to nobody -- the app has no remittance path at all

- **Found:** 2026-08-17, answering "who does the money go to?" after the first
  real payouts (C35). **Open**, and deliberately so — see the decision below.
- **What the code does:** `computeStatutorySplit` derives the SSS / PhilHealth /
  Pag-IBIG employee and employer shares per RA 10361 (employer covers 100% under
  ₱5,000/mo; split above it). `initiate_payslip` subtracts the **employee share**
  from `net_pay`, and `payslips.statutory_employee_share` snapshots it. The
  kasambahay is therefore paid less by exactly that amount, on every cutoff.
- **What no code does:** send it anywhere. There is **no remittance path in
  either repo** — no agency integration, no payable, no record that a
  contribution was ever forwarded, and no way for a kasambahay to see whether it
  was. The employer share is computed for display only and never leaves the
  screen. Grep for "remit" across both repos: the only hit is an aspiration in
  `home-management-concept.md`'s fintech roadmap.
- **Why the gap is easy to miss:** `ARCHITECTURE.md` 5.2 calls this the
  "Statutory Contribution Matrix" and says it "automates SSS, PhilHealth, and
  Pag-IBIG monthly calculations", which is true and reads as more than it is.
  Calculating a deduction and discharging the obligation it represents are
  different things, and only the first is built.
- **Decision (user, 2026-08-17): the manager remits outside the app, and that is
  the intended model for now.** LINARA is not becoming a remittance processor.
  This entry stays open as a *disclosure* gap rather than a payments one.
- **Proposed closure, not yet built — proof of remittance, visible to the
  kasambahay.** An entry on the manager's payment surface accepting evidence
  that the contributions were paid (reference number, period covered, an
  uploaded receipt), surfaced in the helper's own app so she can see her
  government deductibles are genuinely being remitted rather than simply
  withheld. That is the point of it: today the deduction is visible to her and
  its destination is not, which is precisely the trust asymmetry this product
  exists to remove. Cross-repo when built — a table here, a manager-facing
  upload in this app, a read-only view in `../LINARA_MOBILE`'s My Pay, and
  Storage rules for the receipt file.
- **Why it matters before a real household, not after:** withholding an
  employee's statutory share and failing to remit it is the *employer's*
  liability under RA 10361, and the app is the thing telling them the amount was
  handled. Sandbox data today, so nothing is exposed — but the moment a real
  kasambahay is onboarded, every cutoff creates a real obligation whose
  discharge this system neither performs nor records. **Related:** C42's
  per-entry settlement gap and this one are both "we computed it, we did not
  track what happened to it".

### C47. Rest-off requests accepted past dates and overlapping windows, and the `cancelled` status existed with nothing able to set it

- **Found:** 2026-08-16 as C39's residual limitations. **Closed:** written
  2026-08-17 as Session E item E3a; `supabase/add-rest-off-validation.sql`
  applied by hand in the Supabase SQL editor by the maintainer **2026-08-18**.
- **What was wrong:**
  1. **Past dates were requestable.** `request_rest_off` never compared
     `rest_date` to anything, so a helper could ask for a day off that had
     already happened — and a manager could approve it, debiting real minutes
     for time that could not be taken.
  2. **Overlapping windows were accepted.** The only guard was
     `rest_off_one_approved_per_window`, a unique index on
     `(helper, date, start, end)` for approved rows, which stops an *exact*
     duplicate and nothing else. `08:00-12:00` and `09:00-13:00` on one day both
     passed, double-debiting the hours they share.
  3. **`cancelled` was unreachable.** The status was in the table's CHECK
     constraint from the start and no code path ever set it, so a mistyped date
     could only be undone by asking a manager to *decline* — recording a refusal
     in the history where there had only been a typo.
- **Fixed by:**
  - `rest_date < household_today()` refused, on the Postgres clock in the
    household's timezone (C38) so a device with a wrong date cannot defeat it.
    **Today itself stays requestable** — asking at 08:00 for 14:00 is ordinary.
  - A half-open overlap check against both `pending` and `approved` rows for
    that helper and date. Half-open matters: `08:00-12:00` and `12:00-16:00` are
    adjacent, not clashing, or nobody could book consecutive slots. Pending is
    included because two overlapping pending requests would otherwise both be
    approvable, and the second approval would silently take hours the first
    already had.
  - `cancel_rest_off_request` — the kasambahay who asked, or a manager, may
    withdraw a **pending** request. An **approved** one cannot be cancelled here:
    the balance is already debited and a day may have been arranged around it,
    which is a conversation rather than a button.
  - **`request_rest_off` now locks the HELPER row** (`FOR UPDATE`), not the
    request rows — the contended resource is her balance and her day, and two
    requests that do not exist yet cannot be locked. Without it, two concurrent
    overlapping requests both pass the check and both insert. This is precisely
    the mistake C39's first draft made on the *approval* side, where locking the
    request meant two managers approving different requests never contended.
- **Deliberately NOT enforced: the shift check.** C39 lists "nothing checks a
  requested window against the helper's actual shift". Left open on purpose —
  the rule is not obvious, and a live-in asking for a whole day, or for hours
  straddling her shift boundary, is an ordinary request. Enforcing a guess would
  be this app telling a household how to arrange its own time. It stays with the
  manager's approval, which is a human reading a request.
- **Verified against a real Postgres**, same harness as C36–C42: fixture with a
  linked helper user (so the "her own request" branch is genuinely exercised),
  migration applied twice for idempotency, then **11 behavioural checks** —
  past date refused, today and future accepted, overlap refused against pending
  *and* approved, adjacent windows allowed, a cancelled window becoming
  re-requestable, double-cancel refused, approved-cancel refused, the owning
  helper allowed, a *different* helper refused, and the balance untouched by
  cancelling a pending request. Plus an **overlapping-transaction test**: with
  one session holding an open request transaction, a concurrent overlapping
  request for the same helper blocked on the helper lock, then correctly refused
  once the first committed — exactly one row landed.
- **Cross-repo:** `../LINARA_MOBILE` gained `cancelRestOffRequest`, a
  Kanselahin button on pending rows only, and an advisory past-date warning fed
  by `household_today()` from the cutoff RPC — never the device's clock. The
  overlap check is deliberately *not* mirrored client-side: it would need every
  existing window for that date, and a stale client refusing a legitimate
  request is worse than the server refusing an illegitimate one with a message
  that says which window clashed.

### C48. A payout that stopped moving looked exactly like one that was merely slow, and nothing but hand-written SQL could unstick it

- **Found:** 2026-08-18, opening Session E item E5 (what remained of Session D).
  C21 had recorded the `pending_send` half and accepted it when nothing had ever
  really paid out. **Closed:** 2026-08-18, code only — **no migration**.
- **What was wrong:** `pending_send` and `processing` rendered as "Sending…" and
  "Processing" *indefinitely*. Two different failures hid behind that:
  - **`pending_send`** means `initiate_payslip` wrote the row and the Xendit call
    never resolved — the server function died between the two (its own doc
    comment predicted this). Nothing else can ever move that row.
  - **`processing`** means Xendit accepted it and the webhook never came. **C44
    is that case exactly**: a stale deployment 500'd every callback, and both
    payouts would have sat in `processing` forever. The fix then was a hand-run
    `record_payout_attempt_result` in the SQL editor, because the app offered
    nothing.
- **Fixed by** `src/features/pay/payout-staleness.ts` (pure, 12 tests) plus a
  `reconcilePayoutFn` server action surfaced as a **"Check with Xendit"** button
  that appears only once a payout is actually stale:
  - **Different fuses for different failures.** `pending_send` is stale after
    **2 minutes** (Xendit answers in seconds; past that it is abandoned, not
    slow). `processing` after **60 minutes** — sandbox settles in ~80s and real
    e-wallet payouts in minutes, but Xendit's own `estimated_arrival_time` has
    been observed at +15 min, so the threshold is generous on purpose. A false
    "stuck" badge teaches a manager to ignore the badge, which costs more than
    the waiting it saves.
  - **The advice is "check", never "retry".** `pending_send` may already have
    reached Xendit, so assuming it did not is precisely how a cutoff gets paid
    twice. A test asserts the wording, because this is the one place a
    well-meaning edit could invert the safety property.
  - **Reconciliation resolves through `record_payout_attempt_result`** — the
    same function the webhook calls — so a manual reconciliation and an
    automatic one cannot reach different conclusions.
- **The judgement call worth knowing about:** `lookupXenditPayout` now returns a
  discriminated `{ok:true, payout}` / `{ok:false}` instead of a bare null,
  because **"Xendit has no such payout" and "we could not ask Xendit" are
  different facts** and conflating them is how a reconciliation double-pays.
  E1's probe 1F is what makes the distinction usable: an unknown reference
  returns HTTP 200 with an empty `data` array, not an error. So:
  - reconcile + clean "no such payout" → attempt `failed`, vales released,
    cutoff payable again. Safe **only because minutes have passed** — the button
    is not offered on a fresh payout.
  - reconcile + failed lookup → **throws and records nothing.** An unanswered
    question is not an answer.
  - The *send* path deliberately keeps its old, more conservative reading: it
    runs milliseconds after the request, where Xendit legitimately may not have
    recorded it yet, so "not found" stays `ambiguous` there.
- **Also in this pass:** `usePayslips` polls every 15s **while and only while**
  something is `pending_send`/`processing`. A payout's terminal status arrives by
  webhook minutes after the click, and nothing refetched — so even a perfectly
  healthy payout kept reading "sending" until the manager reloaded. Polled rather
  than subscribed on purpose: Realtime would need `payslips` added to the
  publication, a migration widening what is broadcast on a money table, to save a
  query that only runs during a payout.
- **Still open from E5:** the *bulk* reconciliation view (our
  `payslips`/`payout_attempts` against Xendit's whole ledger, which would catch
  orphans and amount drift like C35's ₱3,562.50-vs-₱356,250 without anyone
  suspecting a specific row), and `households.timezone` still has no UI (C38).

### C49. The kasambahay typed dates and times by hand on a phone, and a picker is the easiest place to reintroduce C38

- **Found:** 2026-08-16 as C39's fourth residual. **Closed:** 2026-08-18,
  Session E item E3b — `../LINARA_MOBILE` only, no migration.
- **What was wrong:** the rest-off request form took `YYYY-MM-DD` and `HH:MM` as
  free text. It validated the shape, so a typo became an error message rather
  than bad data — but every typo was still a round trip through failure, on a
  phone keyboard, for the user with the least reason to tolerate one.
- **Fixed by** `components/ui/date-time-field.tsx`, wrapping
  `@react-native-community/datetimepicker` (installed via `expo install`, so the
  version matches the SDK) in a field styled to match `TextField`. **The value
  stays a wire string** — `YYYY-MM-DD` / `HH:MM` — so the RPCs, the advisory
  past-date check and the balance preview are all untouched.
- **The real risk here was not the UI, it was the conversion.** A picker hands
  back a `Date`, which is an *instant*; the RPCs take a *civil* date and time.
  Rendering that instant with `toISOString()` converts to UTC first, so in
  Asia/Manila anything before 08:00 lands on the **previous day** — which is
  C38, the bug that had client and server disagreeing about cutoffs for weeks.
  `lib/datetime-fields.ts` therefore reads local components only and never
  touches UTC in either direction (`new Date("2026-08-20")` is UTC midnight by
  spec, so parsing is built from parts too). **26 tests**, run under `UTC`,
  `Asia/Manila` and `America/Los_Angeles` — the same three zones ../LINARA's
  suite uses, including the positive offset that actually broke.
- **A subtlety the tests caught in their own first draft:** they built a `Date`
  inside the timezone wrapper and asserted on it *outside*, which fails for a
  correct implementation — a `Date` is an instant, so local midnight in Manila
  really is the previous day when read back in another zone. The assertions now
  live inside the wrapper. Worth knowing before writing the next timezone test:
  it is easy to write one that tests the harness instead of the code.
- **Other behaviour worth recording:** the picker's `minimumDate` is fed from
  `household_today()` (the same server-derived date the advisory warning uses,
  never the device clock), so a past date cannot be offered in the first place —
  the server still refuses one regardless. And an Android dialog dismissal
  reports `event.type === "dismissed"`, which must not be written as a value, or
  cancelling silently selects whatever the wheel was showing.

### C50. A helper who lost her session could not sign back in, and neither app had a password reset (former Open Gap O3)

- **Found:** 2026-09-30, launch-readiness review. **Fixed:** 2026-09-30.
- **Was:** `LINARA_MOBILE`'s `(auth)` stack had only the invite-code path, and that code is single-use. A reinstall, a new phone or an expired refresh token locked the helper out for good. There was no sign-out, and no password reset in either app.
- **Fix (`LINARA_MOBILE`):** `app/(auth)/sign-in.tsx` plus `services/api/auth.ts`. `signInHelper` signs in and then requires a `helper_profiles` row; a manager account is signed straight back out with a pointer to the web dashboard. `welcome.tsx` now links to sign-in. `(app)/_layout.tsx` sends a lost session to sign-in rather than the invite screen. A two-tap Sign out (`components/features/account/sign-out-button.tsx`) sits at the bottom of My Pay. It refuses while `offline_sync_queue` still has rows: the queue isn't scoped to a user, so those rows would otherwise replay under whoever signs in next on the phone, private notes included. It clears the React Query cache on the way out.
- **Fix (`LINARA`, shared reset):** one `/reset-password` page (`password-reset-flow.tsx`) serves both apps. Without a recovery fragment it requests a link (`requestPasswordResetFn`); arriving from the link it sets the new password (`completePasswordResetFn`, using a per-request client so the recovery session can't linger in the shared `supabaseClient`). The manager `/login` has a "Forgot password?" link. Both apps' Supabase clients use the default implicit flow, so a reset started on the phone completes fine in a browser. The landing page forwards `#type=recovery` links to `/reset-password` for resets sent without a redirect.
- **Manual setup still required (Supabase dashboard, not code):** add `<web origin>/reset-password` to Auth → URL Configuration → Redirect URLs, or Supabase silently falls back to the Site URL. Set `EXPO_PUBLIC_WEB_APP_URL` in `LINARA_MOBILE`'s env/EAS secrets; it's optional, and without it the Site URL plus the landing-page forward still works.
- **Not verified on a device:** `LINARA_MOBILE` has no `react-native-web`, so the new screens were typechecked and linted but not rendered. The web half was checked in a production build.

### C51. Landing page claimed "on-chain" validation, Batas Kasambahay compliance, training modules and OFW mode (former Open Gap O6)

- **Found:** 2026-09-30, launch-readiness review. **Fixed:** 2026-09-30.
- **Was:** `src/routes/index.tsx` said rates were "validated on-chain" (no blockchain exists), "Batas Kasambahay Compliant" (C46: contributions are deducted, never remitted), mentioned "completed training modules" (no such feature) and a portable portfolio (O4), and pitched OFW management (O2).
- **Fix:** the copy now says only what ships. "Built around Batas Kasambahay": wages checked against the regional minimum, and the SSS/PhilHealth/Pag-IBIG split worked out on every payslip. "Her login, her pay record": she sets her own password; payslips, vale balance and rest owed show the same numbers on both sides. "Built for busy parents who can't watch the house all day" replaces the OFW line.
- **Put these back when:** "compliant" once remittance exists (C46), OFW once O2 closes, and portable record once O4 closes.
- **Same pass (brand assets, not a gap):** replaced the placeholder `favicon.ico`-for-every-size PWA icons and Expo's default mobile icons with an interim logomark (the brand doc's "i"-dot as a roofline with a check tick), added `og-image.png` plus `og:image`/`twitter:image` meta (made absolute via the new `SITE_URL` build var, falling back to Vercel's production URL), renamed the mobile app from `LINARA_MOBILE` to `Linara`, and made the iOS icon opaque. The mark is a stand-in until a designer produces the real one.

### C52. A missed routine instance couldn't be cleared from Needs You (former Open Gap O10)

- **Found:** 2026-09-30, adding past-due tasks to Needs You. **Fixed:** 2026-09-30.
- **Was:** Unfinished tickets carry over across days and "Start new day" respawns every routine, so a missed routine instance sat past due indefinitely. The first cut offered only "Move to next workday", and not for routines (moving one would duplicate the next spawn).
- **Fix:** Past-due items in Needs You now have **Edit** (title, note, date, time; `edit-task-modal.tsx`, which warns when the new time falls outside the helper's shift) and **Cancel task** (with an inline confirm). Move was dropped: the user's call was that an overdue task is often no longer needed, so changing or removing it fits better than pushing it forward. Cancel deletes the row (`deleteTicketFn`): `tickets.status` has no `cancelled` value, and a ticket still `todo` carries no work or ledger entry (`ledger_entries.associated_ticket_id` is `ON DELETE SET NULL` regardless), so nothing of the helper's record is lost. For a routine instance, cancelling is effectively "skip this one".
- **Deliberately not in Edit:** reassigning to another helper. That is a new ask to a different person and should go through New task and its send gate (`use-send-gate.ts`). Remote admins see past-due items but get neither action, since schedules stay with on-site managers.
- **Revisit if:** a real `cancelled` status is added (concept §8's state machine has one). Then cancel should set it instead of deleting, so the Pass can show "cancelled" rather than the task silently vanishing from the helper's app.

### C53. A helper couldn't say "not now" -- no Blocked path in the mobile app (former Open Gap O11)

- **Found / fixed:** 2026-09-30 / 2026-10-01, `LINARA_MOBILE` branch `jamesDev-worker-station` (`81bd16a`).
- **Was:** the concept doc keeps Blocked on purpose ("the ability to say 'not now' is what separates a colleague from a subordinate") and the web Pass shows blocked tasks in Needs You, but nothing in the mobile app wrote `status = 'blocked'` or `block_reason`.
- **Fix:** "Hindi ko magagawa ngayon" on the focus card: three one-tap reasons or her own words, no approval step. `blockTicket` uses the existing columns (RLS already allowed the update), with a new `block_ticket` offline-queue action. While on hold the card shows her reason; `pickFocus` moves her to the next task, and the manager's Reschedule in Needs You puts it back.

### C54. No completion photo -- the Done "plated dish" was never captured (former Open Gap O12)

- **Found / fixed:** 2026-09-30 / 2026-10-01, `LINARA_MOBILE` `f0b2960`.
- **Was:** `plan.md` and the concept doc describe Start -> do -> photo -> Done, and the web's OFW glance is built from Done photos, but `today.tsx` completed tickets with no photo (roadmap Story 7 omitted the step).
- **Fix:** an optional "Ipakita ang natapos mo" photo before Done, reusing the palengke receipt path (compressed upload to `household-evidence`, `<household>/tickets/...`; offline it queues with the local file). A failed upload leaves the task in progress rather than completing it without the photo. Never required.

### C55. The Worker's Station had no close (former Open Gap O13)

- **Found / fixed:** 2026-09-30 / 2026-10-01, `LINARA_MOBILE` `50016ca`.
- **Was:** mobile never read `households.board_closed`, showed no day summary, and offered the next task after her shift.
- **Fix:** `DayCloseCard` ("Great work today — 8 of 8, tapos!", a rest line, what's left, what's on hold) replaces the focus card when the board is closed (polled each minute; there is no realtime channel on `households`), on her rest day, overnight (22:00-06:00) or after her shift, unless she has opted in as Available. A task already in progress, or one sent off-hours through the override/emergency path, still shows under it. Greeting follows the hour.
- **Residual:** board-closed reaches the phone within a minute, not instantly. A realtime subscription on `households` would fix that if it matters.

### C56. The helper's focus card showed unapproved suggestions, queued tasks and later-dated tasks

- **Found / fixed:** 2026-10-01, `LINARA_MOBILE` `47da6ce`.
- **Was:** `getFocusTask` took her earliest unfinished ticket with no other filter, so her Station could show a remote admin's suggestion still awaiting on-site approval (`suggested`), a ticket held off the board until the manager reopens it (`queued`), or a ticket scheduled for a later day. The first two contradict the concept doc's remote-admin rule and "the board closes for the night"; the web Pass hides all three.
- **Fix:** the query filters `suggested = false` and `queued = false`, and applies the same day-by-day rule as the web Pass (`isLaterThanToday`, in `lib/today.ts` with tests). It also stopped re-reading her finished history on every fetch.

### C57. Helpers' flags on their terms never reached the manager

- **Found / fixed:** 2026-10-01, `LINARA` `456d2dd`, while adding My Record's "May mali?" in `LINARA_MOBILE` (`8e95906`).
- **Was:** the web never read `invite_flags`. `use-invites.ts` mapped every helper with `flags: []`, so a flag a kasambahay raised while claiming (`flag_invite`, "the wage is wrong") was stored and shown to no one, and Needs You's "Mark resolved" only hid a flag in the current tab. The review-terms promise that she can flag anything wrong had no manager side.
- **Fix:** `listInviteFlagsFn` loads the household's flags (a separate query, since `invite_flags.invite_id` has no declared foreign key to embed on) and `use-invites` attaches them per helper; `resolveInviteFlagFn` deletes on "Mark resolved", with rollback and a toast on failure. The invite-time minimum-wage check now writes `field = 'wage_below_minimum'` and shows as a "Compliance check" instead of as the helper flagging her wage. `LINARA_MOBILE` My Record lets a claimed helper raise a flag any time; `flag_invite` only accepts unclaimed invites, so she writes the row directly under the household-scoped `invite_flags_isolation` policy.
- **Residual:** wage-check rows written before this change carry `field = 'wage'` and still read as helper flags (sandbox data only).

### C58. No push notifications: an override only reached a helper whose app was open (former Open Gap O7)

- **Found / fixed:** found 2026-09-30 (launch-readiness review); fixed 2026-10-01, `LINARA` `20a895e` `74f6dbf` `d1c1c9e`, `LINARA_MOBILE` `b7144f4`.
- **Was:** `plan.md` §2.4 step 4 ("the helper receives a high-priority alert") and §2.2 step 5 (appointment-moved heads-up) had nothing behind them. There was no `expo-notifications` and no token storage, and Realtime only delivers while the app is open.
- **Fix:**
  - **Schema** (`supabase/add-push-tokens.sql`): a `push_tokens` table (one row per phone, private to its owner by RLS). `register_push_token` / `unregister_push_token` handle a shared phone changing hands. `helper_push_tokens(helper_id)` lets a primary or co-manager read an active helper's tokens in their own household.
  - **Web** (`src/features/notifications/push.ts`): sends through Expo's push service from inside the server functions, after the write has succeeded. A failed push never fails the write.
  - **When it pushes** follows the concept doc's "no pings after hours" rule:
    - utos or tasks the manager sent through the friction wall as **override or emergency**;
    - an **appointment move**, only to helpers whose tasks moved and whom the manager's app sees as reachable now.
  - **When it stays silent:**
    - "let it wait", queued and suggested items;
    - ordinary sends while she's on shift, which Realtime already delivers.
  - **Mobile** (`lib/notifications.ts`, `hooks/use-push-notifications.ts`):
    - registers after sign-in and drops the token on sign-out;
    - uses an Android "alerts" channel;
    - a tap opens Today and refetches.
- **Residual:**
  - Expo Go on Android has no remote push (SDK 53+), so testing on Android needs a development build (`eas build --profile development`). iOS Expo Go works.
  - Dead tokens: pruned since `c38a7a9`/`6d6f0f7` (`supabase/add-push-token-pruning.sql`). Each send reads the previous send's receipts, deletes tokens Expo reports as `DeviceNotRegistered` there or in this send's tickets, and records the new ticket ids. The mobile app (`a4edc7a`) also drops its own old token when Expo issues a new one. A dead token whose receipt is more than 24 hours old is caught by the next send's ticket instead.
  - `EXPO_ACCESS_TOKEN` (optional, Vercel) is only needed if the Expo project turns on enhanced push security.
  - Reachability for appointment moves is the manager's app's view (`statusFor` on the sim clock), not a server-side check.

### C59. `reschedule_notice.oldTime` was rendered in the web server's time zone (former Open Gap O14)

- **Found / fixed:** found 2026-10-01 building the mobile heads-up; fixed the same day, `LINARA` `d1c1c9e`, `LINARA_MOBILE` `2ad7f58`.
- **Was:** `rescheduleAppointmentFn` (a server function) formatted the old time with `isoToDisplayTime`, in the runtime's zone (UTC on Vercel), so a Manila "was 8:00 PM" was stored as "12:00 PM". Separately, its "did the time move" check compared strings, and Postgres's `+00:00` never equals `toISOString()`'s `Z`, so every edit (even title-only) stamped a notice.
- **Fix:** the notice stores `oldStartIso` (an instant) and each device formats it. The web maps it in `use-task-board.ts`, and the mobile heads-up now reads "… na ngayon (dati Huwebes, 6:00 PM)". The move check compares instants.
- **Residual:** notices written before the fix carry only the wrong-zone string, so both apps say the task moved without the old time. Since `d9c80a8` the web shows the notice on board and schedule cards ("Moved from Thu 6:00 PM when … changed") until the task is done. Before that nothing rendered it after the helper views left the web app.

### C60. A helper could never leave a household, and her record had nowhere to go (former Open Gap O4)

- **Found / fixed:** found 2026-09-30 (launch-readiness review). The PDF export shipped 2026-10-01 (`LINARA_MOBILE` `585506b`, `db4f8a5`). Ending, past staff, final pay and rejoining shipped the same day: `LINARA` `4f962e5` `9dfcd33` `99867ee` `7138bb5`, `LINARA_MOBILE` `4a467a1` `b2767d2` `13a57e8` `b3a69a9`.
- **Was:**
  - Nothing ever set `helper_profiles.status = 'INACTIVE'`.
  - `user_profiles.household_id` was `NOT NULL`, so an account belonged to one household forever.
  - A second employer's invite couldn't be claimed by an existing account (`auth.signUp` fails).
  - The claim screen promised "Mananatili ang record mo kahit magpalit ka ng household" with nothing behind it.
- **Fix:** see `supabase/add-employment-end.sql`, which has to be applied by hand.
  - **Model:** one `helper_profiles` row is one employment, not one person. `ARCHITECTURE.md` §8 now says so.
  - **Ending (web, People → End employment):** `end_helper_employment` sets INACTIVE and `ended_on`.
    - Her open tasks move to another active helper or are removed. Pending vale and rest-off requests are closed, and her utos are cleared.
    - Her account is detached from the household (`household_id = NULL`), so the board, pantry and utos close to her.
    - Nothing she did is deleted. Payslips stay for RA 10361 retention.
    - It refuses a last day in the future, before she started, or inside a cutoff already paid.
    - `employment_end_preview` shows all of that first: final pay, an unpaid earlier cutoff (O16), a 13th-month estimate (O15), and rest owed. Rest owed stays time, not money, per C39, so the dialog says to settle it with her.
  - **Final pay:** `helper_pay_cutoff` gives an ended employment a final cutoff that stops on her last day. `initiate_payslip` pays it through the same guarded path. The web pro-rates base and contributions by days worked (`workedShareOfCutoff`) and deducts unsettled vales as usual.
  - **Where the manager finds her:** a Past staff section on People, with the final pay (GCash/Maya) and payslip history, plus a Needs You item while final pay hasn't gone out. Ended helpers drop out of the roster, flags and routine respawn.
  - **Her side:** read-only `*_own_read` policies keep her terms, payslips, time off, tasks and the household's name readable after she leaves.
    - Sign-in checks the account type, not a current household.
    - With no household, only My Record opens (the other tabs are greyed out). It lists every household she has worked for, each with its PDF, and takes an invite code.
    - `join_household_with_invite` activates the new employment on her existing account. It is also used automatically when she "claims" with an existing email.
    - Her private notes follow her. `helper_notes_privacy` is now set-valued, because the scalar version would have errored on her second employment.
- **Residual:**
  - Three follow-ups were fixed in C63: she couldn't record leaving herself, "worked from" was the invite date, and "from [name]" was lost after she left.
  - One active employment at a time (`current_household_id()` is single-valued), so part-time work in two households at once isn't supported. Out of scope by decision (2026-10-01).
  - Offline actions still queued on her phone when she's detached will fail on replay.
  - Not yet exercised against the live database or on a device.

### C61. A missed cutoff could never be paid, and money paid outside Linara left no record (former Open Gap O16)

- **Found / fixed:** found 2026-10-01 building end-of-employment. Fixed the same day: `LINARA` `5a8bdef` `556117b` `a7cb414`, `LINARA_MOBILE` `ee735f7` `cce5f55`.
- **Was:** `initiate_payslip` only ever paid the cutoff containing today (or, after C60, the final one), so a cutoff nobody paid on time stayed unpaid on the record forever. Money handed over in cash or by bank transfer had no place in Linara at all.
- **Fix:** see `supabase/add-pay-periods.sql`, which has to be applied by hand after `add-employment-end.sql`.
  - **One list of pay periods.** `helper_pay_periods()` lists every cutoff since Linara started tracking her, with the days she worked and the payment that settled it. The web's Pay Dial, Money, Past staff and Needs You read it, and so does mobile My Pay.
  - **Paying a missed period.** `initiate_payslip` takes `p_cutoff_start` to pay a missed period. Money and Past staff list the unpaid periods, each payable by GCash or Maya.
  - **Payments made outside Linara.** `record_offapp_payslip()` records "Paid outside Linara" (cash, bank transfer, other) as a `manual` payslip with `helper_ack = 'pending'`.
    - She answers in the app. "Natanggap ko" means received; "Hindi ko natanggap" means not received, and goes to the manager's Needs You.
    - Only confirmed manual payments count on her record and PDF.
    - A record she hasn't confirmed can be withdrawn (`withdraw_offapp_payslip`), which frees its vales and the period.
  - **Double-pay guard.** `pay_target()` matches by overlap, so a period can't be paid twice across Xendit and manual payments.
  - **Tests.** `supabase/tests/pay-periods.test.mjs` (`npm run test:sql`) runs both migrations in PGlite and checks 40 scenarios.
- **Residual:**
  - Periods from before she was added to Linara aren't listed.
  - A dispute is resolved by talking it through and withdrawing and re-paying. There is no in-app thread.

### C62. 13th-month pay was neither computed nor paid (former Open Gap O15)

- **Found / fixed:** found 2026-10-01; fixed the same day, same commits as C61.
- **Was:** `plan.md` promises 13th-month calculations (RA 10361 Sec. 25), and nothing computed or paid them.
- **Fix:** `thirteenth_month_due()` computes 1/12 of the basic pay on record for the calendar year: regular payslips that went out, less any she disputed.
  - **When it's payable:** from December 1, or once her employment has ended (pro-rated to her last day). It's due by Dec 24, or with her final pay.
  - **How it's paid:** as a `thirteenth_month` payslip, through the same GCash, Maya or outside-Linara options, with no contributions or vale deducted. Postgres computes the amount itself.
  - **Where it shows:** web Money and Past staff; mobile payslip history and the PDF.
- **Residual:** it's computed from basic pay paid through Linara, so it's only as complete as the pay record. Periods paid outside Linara count only once she confirms them.

### C63. After C60: her notice, her real first day, and her name on old tasks

- **Found / fixed:** C60's residuals, fixed 2026-10-01 with C61.
- **Notice:** `give_notice()` and `withdraw_notice()` let her give her last day and a message from My Record. The manager sees it in Needs You and on People ("Leaving Oct 20"), and End employment opens on that day. A trigger clears the notice when the employment ends.
- **First day:** `helper_profiles.started_on`, set on the invite form (backfilled from the invite date). It's used on her record and PDF, and it pro-rates a first cutoff she started partway through. That pro-rating shows on the Pay Dial and in the mobile estimate the same way the payout applies it.
- **Names:** `user_profiles_former_staff_read` lets a manager keep reading the names of people who worked in their household.

### C64. The split between Vercel env vars and Supabase Edge Function secrets wasn't documented (former Open Gap O1)

- **Found / fixed:** found 2026-08-14 deploying to Vercel. README §12.1–12.3 had covered most of it since; finished 2026-10-01.
- **Was:** the local `.env` was the only documented configuration, so it was easy to fill in Vercel, see the AI features fail on the Supabase side, and not know where to look. `.env.example` and `architecture.md` §11 also listed `JWT_SECRET` and `SYSTEM_CRON_SECRET`, which nothing reads.
- **Fix:**
  - `.env.example` is grouped by where each value lives (Vercel vs. Supabase secrets) and lists the Xendit and `EXPO_ACCESS_TOKEN` values it was missing.
  - The two placeholder secrets are gone everywhere. The purge they were reserved for runs in `pg_cron` and needs none (C65).
  - README §12.2 gains `EXPO_ACCESS_TOKEN`; new §12.5 covers migrations and scheduled jobs, and §12.6 the mobile app's own `.env`. `architecture.md` §11.1 points at README §12. `supabase/DEPLOYMENTS.md` lists the cron job and how to check it.
- **Residual:** which AI provider to use is still open. That decision now lives in README §12.4 (it used to sit inside this gap). The privacy policy has to name the provider before it goes live.

### C65. Quick Utos were deleted only when a manager opened the app (former Open Gap O5)

- **Found / fixed:** found 2026-09-30, launch-readiness review. Fixed 2026-10-01.
- **Was:** the only deletion was the web app's day rollover, which needs a manager's browser, so utos could sit in `quick_utos` for days.
- **Fix:** `supabase/add-nightly-utos-purge.sql`, applied by hand.
  - `purge_stale_quick_utos()` deletes every uto created before the start of its household's current day, in `households.timezone` (C38). Only `postgres` can run it.
  - A `pg_cron` job, `purge-stale-quick-utos`, runs it hourly at :05, so each household's utos go within the hour after its own midnight, wherever it is.
  - The rollover's own deletion stays as it was.
  - Tested in PGlite (`supabase/tests/privacy.test.mjs`): it keeps today's and deletes yesterday's, running it twice deletes nothing more, and an app user can't call it.
- **Residual:**
  - Utos still `waiting` for her next shift are purged too. That matches the spec ("all individual Quick Utos") and what "Start new day" already did, but a uto sent at 11 PM for the morning is gone by morning.
  - The `pg_cron` half can't run in PGlite. Check `cron.job` after applying (the query is in the migration and in `DEPLOYMENTS.md`).

### C66. Task times showed in the viewer's device time zone, not the household's (former Open Gap O9)

- **Found / fixed:** found 2026-09-30. Fixed 2026-10-01 in `LINARA`.
- **Was:** `combineDateAndTime` and `isoToDisplayTime` read and wrote `tickets.scheduled_start` in the browser's zone, so a manager abroad saw and entered task times shifted by the difference.
- **Fix:**
  - **The zone.** `src/lib/time.ts` holds the household's zone. The four sign-in paths in `people.actions.ts` return `households.timezone`, and `use-session.ts` sets it before the session turns `authed`, so every store loads in it. Until it's known, the device's zone is used, as before.
  - **The conversions.** `toHouseholdClock()` (instant → wall clock) and `fromHouseholdClock()` (wall clock → instant) are what `combineDateAndTime`, `isoToDisplayTime`, `isoToISODate`, `startOfDayIso`, `formatTimeOfDay` and `formatClock` now go through.
  - **Callers that read "now".** Availability, the ledger's rest-day/break classification, the board's "now" line, `taskWhen`, `isLaterThanToday`, `movedFromLabel`, the board's starting day and rollover check, and the "today" defaults in the pay and people forms.
  - **The scheduler AI.** The board's day is now sent as `householdDayStamp()` (`2026-10-01T00:00:00+08:00`). Both mocks (`appointment.actions.ts` and the `parse-scheduler` edge function) do their day math on that stamp instead of the server's own zone, which is UTC on Vercel and gave the wrong weekday for Manila. The live prompt is told to keep the household's offset.
  - **Tests.** `src/lib/time.household-zone.test.ts` checks a Manila household read from devices in Manila, Dubai and Los Angeles, plus a household with daylight saving.
- **Residual:**
  - `LINARA_MOBILE`'s helper screens still use the phone's zone. That's deliberate: her phone is in the house. A manager using the app sees the web dashboard (O18), which is fixed.
  - The `parse-scheduler` change takes effect only once the function is redeployed (`DEPLOYMENTS.md`).
  - `toHouseholdClock` returns a Date whose local fields read the household's clock. An hour that doesn't exist on the device itself (its own spring-forward night) shifts by an hour on display. No Philippine zone has daylight saving.

### C67. No privacy policy, terms, or account deletion (former Open Gap O8)

- **Found / fixed:** found 2026-09-30. Fixed 2026-10-01, as drafts pending legal review.
- **Was:** nothing anywhere. Both app stores require a privacy-policy URL and in-app account deletion, and RA 10173 applies.
- **Fix:**
  - **The pages.** `/privacy` and `/terms` on the web app (`src/features/legal/`), written from what the two apps actually store and send rather than from a template. Each opens with "Draft, under legal review", and the privacy policy has a Filipino summary. They're linked from the landing footer, `/login`, the mobile join screen (`review-terms.tsx`) and the mobile My Record.
  - **Deletion requests.** `supabase/add-account-deletion.sql` adds `account_deletion_requests`, with `request_account_deletion()` and `cancel_account_deletion()` for either app. Managers ask from People → "Your account"; helpers from My Record → "Burahin ang account ko", available with or without a household.
  - **Carrying them out.** `process_account_deletion(user_id)` is operator-only and run from the SQL editor within 30 days.
    - **It deletes:** the login (cascading to the profile and push tokens), her private notes, and, for a household's last manager, its appointments, pantry and grocery lists, SOPs, utos and unclaimed invites, plus the household itself if nobody ever worked there.
    - **It keeps:** each employment and its payslips, vales, hours, leave and tasks, unlinked from the login. That's the RA 10361 record, and the helper's.
    - **Attribution columns** (`created_by`, `requested_by` and so on) are found from the catalog and set to NULL.
    - **It refuses** while the person, or the household they're the last manager of, still has an ACTIVE employment, so final pay is settled first.
  - **Tests.** Tested in PGlite (`privacy.test.mjs`).
- **Residual:**
  - **Legal review.** A lawyer has to review both documents before public launch.
  - **Contact address.** There is no privacy contact yet: `PRIVACY_CONTACT_EMAIL` in `legal.constants.ts` is null, and the pages show a visible placeholder.
  - **Manual processing.** Requests are carried out by hand, so someone has to check `SELECT * FROM account_deletion_requests WHERE status = 'pending'`.
  - **Photos.** Files in Supabase Storage for deleted rows (pantry or appointment photos) aren't removed by the function.
  - **Not run live yet.** `DELETE FROM auth.users` inside the function hasn't been run on the live project. Check the first real one.

### C68. Managers could only plan one day at a time (tester feedback)

- **Found / fixed:** found in tester feedback 2026-10-01, fixed the same day.
- **Was:** New task always landed on today's board, the only way to put a task on another day was opening it and changing its date, and nothing showed more than today plus a flat "Coming up" list.
- **Fix:**
  - **Plan ahead.** A new top section on Schedule (`src/features/tasks/components/task-planner.tsx`). Week view is a board of seven day columns (stacked on phones, with past days folded away); Month view is a calendar. Each day shows who has it off, its appointments and its tasks, and filters to one person or Unassigned.
  - **Adding and moving.** Any day from today on takes a new task. A waiting or on-hold task drags to another day, keeping its time, with Undo and an out-of-shift warning. Any task opens to edit. Remote admins can look and suggest only.
  - **New task has a Date.** On the Pass too, which links to the planner. A task planned for a later day skips the "she's off right now" wall (`use-send-gate.ts`), and a closed board no longer queues it; the form warns when the planned time is outside her shift instead.
  - **Data.** `listTicketsBetweenFn` reads every ticket in the visible range, done ones included, and refetches whenever the board does, so Realtime changes reach it too. No schema change.
- **Residual:**
  - **Touch dragging.** Drag-and-drop is HTML5, so it works with a mouse but not reliably by touch (the mobile WebView). On a phone, a task moves by opening it and changing its date.
  - **Routines.** Routine templates are still local-only (gap #4's closure notes), so the planner can't show a routine's future days before it spawns them. Partly addressed by C69: it now shows the routines this tab knows about.

### C69. Plan ahead couldn't be put away, and Schedule mixed the calendar with its setup (tester feedback)

- **Found / fixed:** found in tester feedback 2026-10-01, fixed the same day on `jamesDev-schedule-update`.
- **Was:** Schedule stacked six things in one scroll: the planner (always open, no way to fold it), Shifts, Quick Utos, Routines, Appointments and "Queued for tomorrow". The planner sat on top of the rest, and a "right now" action (Quick Utos) sat on the planning page.
- **Fix:**
  - **Schedule tabs.** Plan, Appointments, Shifts, Routines (`manager-schedule-page.tsx`), kept in the URL as `?tab=` like the Pass's `?view=`. Plan is the default and is the planner alone. `?day=YYYY-MM-DD` opens it on a given week.
  - **On the plan.** Prep tasks say which appointment they're for, and an appointment says how many prep tasks it has (tap it to open Appointments). A task planned outside its helper's shift, or on her day off, is marked "off shift". Routines show greyed on the later days they'll spawn on (`routineGhosts` in `planner.utils.ts`). Queued tasks already showed on their day with a "Queued" tag, so the separate "Queued for tomorrow" list is gone.
  - **By person.** A third view next to Week and Month (`planner-people.tsx`): a row per helper (plus Unassigned), a column per day, her shift hours in the row label and her day off shaded. Dropping a task on another row reassigns it, with Undo. Add on a cell opens New task with that person picked.
  - **Quick Utos moved to the Pass**, under The Line.
  - **Pass to planner.** "Coming up" on The Line and The Board has "See in the planner", which opens the week of the first upcoming task.
  - No schema change. `/manager/pass` and `/login` are untouched (O18).
- **Residual:**
  - **Routines are still local-only** (gap #4). Their greyed copies show only the routines this browser tab knows about, and disappear on reload along with the routines themselves.
  - **Touch dragging** (see C68) also applies to reassigning on By person. On a phone, reassign by opening the task.
  - **By person on phones** scrolls sideways inside its card (names stay pinned). It is readable but cramped; Week stays the better phone view.
  - **Month view** shows tasks and appointments only, not routine copies or off-shift marks.

### C70. Approved rest off showed on neither side's calendar, and didn't stop anyone reaching her (former Open Gap O19)

- **Found / fixed:** found 2026-10-01 checking what the Schedule rework (C69) means for the helper's side, fixed the same day.
- **Was:** `rest_off_requests` were only read on Money (web) and My Pay (helper app). Both calendars knew only the weekly rest day, and availability ignored approved rest off, so a manager could plan a task or send a Quick Utos into time they'd approved as hers.
- **Fix:**
  - **Web.** One time-off model (`src/features/shifts/time-off.ts`, `hooks/use-time-off.ts`) loaded once for the app, refreshed after a decision on Money and every five minutes. The planner shows approved and asked-for rest off on Week and By person and marks a task inside approved time off "time off". `statusFor` treats approved time off as off (her own Available opt-in still wins), the gate says it's her time off, and New/Edit task warn.
  - **Helper app.** `deriveRosaStatus` treats an approved day off as off, and Today's Availability card says so. My Week lists each day's day off, approved or still waiting.
  - Leave (LEAVE_PLAN.md) is meant to plug into the same `TimeOff` shape.
- **Residual:**
  - **Month views** (web planner and My Week's month grid) show a day off only as an outline on the phone and not at all on the web month.
  - **Lag.** The web polls every five minutes, so a request made on her phone takes up to that long to appear on an open dashboard.
  - **Device clock.** The helper app reads "today" from the phone, like the rest of that app, not the household's time zone.

### C71. Moving or reassigning a task from the planner was silent on the helper's side (former Open Gap O20)

- **Found / fixed:** found 2026-10-01 in the same review as C70, fixed the same day.
- **Was:** only appointment moves wrote `tickets.reschedule_notice`. A planner drag, a By person hand-over or a date change in Edit task updated the ticket with no notice and no push, and the helper app's Realtime filter (`helper_id=eq.<her id>`) matches the row after the change, so a task handed to someone else stayed on the phone it left.
- **Fix:**
  - **Web.** `updateTicketFn` works out the change (`scheduleChange`): her task's time moved writes `reschedule_notice` with `movedBy` instead of `appointmentTitle`; a hand-over clears any old notice. If she's reachable right now (`isReachable`, from the same `reachableHelperIds` appointment moves use) she gets a push: "Inilipat ang task", or "Bagong task" for one handed to her. The board's notice reads "Moved from ... by Ana".
  - **Helper app.** The moved-tasks banner says "Inilipat ni Ana." for a hand move. `useRealtimeSubscription` listens household-wide when it knows her household (`tickets_isolation` already lets her read those rows), so a task taken away disappears.
  - **Contract.** `reschedule_notice.appointmentTitle` is now optional in both repos.
- **Residual:**
  - **Older installed builds** of the helper app read a hand-move notice as "dahil binago ang isang appointment" until they update.
  - **Not tested on a device** yet (push and the household-wide Realtime filter).
  - **More refetches.** Every ticket change in the household now refetches Today and My Week on each helper's phone. Fine at household scale.

### C72. A helper's own session could write rows only a manager should (former Open Gap O22)

- **Found / fixed:** found 2026-10-02 writing `supabase/add-leave.sql`, fixed the same day.
- **Was:** `user_profiles`, `helper_profiles`, `vales`, `ledger_entries`, `payslips` and `rest_off_requests` each had one `FOR ALL` policy scoped only by household, and `households_update_budget` let anyone in the household update it. With Supabase's default table grants, a helper's own login used straight against the REST API could make herself a manager, raise her own rate, approve her own vale or rest off, change ledger minutes or a payslip, or close the board. Only the apps' code stood in the way.
- **Fix:** `supabase/fix-helper-write-access.sql` (apply by hand, after every other migration).
  - The household-wide policies keep their names but become `FOR SELECT`. Reads are unchanged, and so are the own-history read policies from C60.
  - Writes are for primary and co-managers only (`is_household_manager()`), scoped to their household.
  - A helper keeps the two direct writes her app makes: asking for a vale (a new pending, unsettled, undecided row for herself), and her own availability. A `BEFORE UPDATE` trigger on `helper_profiles` refuses any other column from her session; it skips managers and anything running inside a `SECURITY DEFINER` function, so claiming, notice and ending employment are unaffected.
  - Checked first: every SQL function that writes these tables is `SECURITY DEFINER`, and the only direct writes in either app are the manager's on the web plus the helper's two above. No app code changed.
  - PGlite test acting as each role: `supabase/tests/write-access.test.mjs` (25 checks, in `npm run test:sql`).
- **Residual:**
  - **Other tables stay household-wide:** `tickets`, `quick_utos` and `appointments`. Helpers write tickets legitimately, so those need per-column rules (e.g. she may change a ticket's status and photo but not its time, assignee or after-hours flag). Lower stakes than money, but the same kind of gap. **Tickets:** per-column rules built with O31 (`add-helper-task-edit.sql`, applied 2026-10-05); `quick_utos` and `appointments` remain. `pantry_items` and `grocery_items` now have per-helper rules (C77).
  - **Remote admins** write none of these tables, matching `plan.md`'s matrix. Nothing creates one yet (O2).

### C73. There was no vacation or leave, only hour-level rest off in lieu (former Open Gap O21)

- **Found / fixed:** found 2026-10-01 (asked whether an approved vacation shows on both sides), built 2026-10-02 in six steps. Plan, decisions and what each step did: `LEAVE_PLAN.md`; legal readings and deferred leave types: `LEGAL_CONSIDERATIONS.md`.
- **Was:** nothing covered multi-day leave. RA 10361 gives a kasambahay with a year of service five days of paid service incentive leave a year; nothing tracked it, its use, or its pay. `rest_off_requests` (one date, a time window) was the only time off.
- **Fix:**
  - **Kinds:** service incentive leave (5 days per service year from her first anniversary), a day off in kind (from rest owed), unpaid leave, and an extra paid day the household gives. Whole days only.
  - **Schema:** `supabase/add-leave.sql` (applied): `leave_requests`, `pay_days_per_year`, balances, and the request / record / decide / cancel / acknowledge functions. Read-only table; every write is a function.
  - **Pay:** `supabase/add-unpaid-leave-pay.sql` (**apply by hand after add-leave.sql**): unpaid leave at `days × monthly_rate × 12 ÷ pay_days_per_year` comes off the payslip for the cutoff it ends in, settled like a vale and released on a failed payout; 13th-month pay counts basic pay less it.
  - **Web:** Needs you decides leave and offers to move her tasks on those days to Unassigned; People shows balances, history and disputes, Record leave and the pay-days setting; leave shows on the planner, in availability and the gate; routines due on her leave spawn Unassigned; the Pay Dial, Money, Past staff, End employment and payslip history show the deduction.
  - **App:** ask, cancel, confirm or dispute leave on My Pay; leave on My Week and Today; the deduction on My Pay's estimate and payslip history; leave on My Record, its PDF and the shared text.
  - **Tests:** `supabase/tests/leave.test.mjs` and `unpaid-leave-pay.test.mjs` (PGlite, in `npm run test:sql`), `net-pay.test.ts` in both repos, and unit tests for the planner, Record leave, and the record PDF.
- **Residual:**
  - Not yet tried on a device or against the sandbox project.
  - Half days, other legal leave (maternity, paternity, solo parent, VAWC, special leave for women) and public holidays are deferred (`LEGAL_CONSIDERATIONS.md`).
  - A leave spanning two cutoffs comes off the later one whole rather than being split; contributions stay on the full monthly rate. Both noted in `LEGAL_CONSIDERATIONS.md` to confirm.
  - Missed-period estimates on Money don't subtract unpaid leave (nor vale), since those come off whichever payment goes first; the payout itself always does.

### C74. Cancelling a task deleted it, so it vanished from the planner and her week

- **Found / fixed:** 2026-10-02, the user asked why a cancelled task wasn't visible anywhere.
- **Was:** Needs you's "Cancel task" deleted the ticket. Nothing recorded that the task had been planned or who called it off, and it disappeared from her My Week without a word.
- **Fix:** `supabase/add-cancelled-tasks.sql` (**apply by hand after add-unpaid-leave-pay.sql**).
  - `tickets.status` gains `'cancelled'`. A trigger stamps `cancelled_at`, `cancelled_by` and `cancelled_by_name`, and clears them when the task is restored to To-do. `cancelled_by` has no foreign key: a second `tickets -> user_profiles` link would make both apps' `created_by_profile:user_profiles(full_name)` embed ambiguous and break every ticket query.
  - `employment_end_preview` doesn't count cancelled tasks as open, and `end_helper_employment` neither hands them on nor deletes them.
  - **Web:** cancelling (Needs you, or the new Cancel task in Edit task on the Schedule) sets the status, with Undo; Edit task on a cancelled one shows who and when, with Restore. The board leaves cancelled tasks out; the planner shows them crossed out with "Cancelled" and who did it, grey in the legend. She gets a push ("Kinansela ang task") if she's reachable. Until the migration is applied, the update is refused by the CHECK and the app falls back to the old delete.
  - **App:** Today, the focus card, moved notices and the palengke step leave cancelled tasks out; My Week shows them crossed out as "Kinansela ng manager".
  - PGlite test: `supabase/tests/cancelled-tasks.test.mjs` (in `npm run test:sql`).
- **Residual:** a helper whose phone queued "done" offline for a task cancelled in the meantime will still mark it done when it syncs; that's left as the truthful outcome.

### C75. The web dashboard never refreshed its access token, so a manager session died after about an hour (former Open Gap O17)

- **Found / fixed:** found 2026-10-01 putting the dashboard in `LINARA_MOBILE`'s WebView; fixed 2026-10-02 after client feedback ("if login session is still active, proper redirection back into the app").
- **Was:** `use-session.ts` stored `linara_manager_refresh_token` but never used it. Once the access token expired (about an hour), server functions failed until a reload, and a reload with the expired token cleared the session, so a manager coming back later had to log in again.
- **Fix:**
  - `refreshManagerSessionFn` (`people.actions.ts`) trades the refresh token for a new session on a throwaway client. Supabase refusing it (4xx other than 429) comes back as `expired`; anything else throws, to retry.
  - `use-session.ts` renews five minutes before expiry, again when a tab comes back from the background past that point (timers stall during sleep), and retries every minute while offline. A refusal logs the manager out. On load, an expired stored token is renewed before restoring the session, and a token that looked fine but was refused gets one renewal and retry.
  - Several tabs share the one stored session: a tab takes a newer token another tab already stored rather than spending the refresh token again.
  - Timing falls back to the token's own lifetime when the device clock disagrees with it, so a clock set ahead can't renew nonstop (`msUntilRenewal`, `isDueForRenewal` in `people.utils.ts`, tested in `session-renewal.test.ts`).
  - Inside the mobile WebView (user agent contains `LinaraApp`) the page doesn't renew: the app owns the session there and keeps handing the page fresh tokens, as before.
  - Same change: `/login` forwards a signed-in manager into the app, and the auth redirects replace the history entry, so the browser's Back from the dashboard leaves to the landing page instead of bouncing back to `/login`.
- **Residual:** a failed restore on load (offline, say) still clears the stored session, as before; in the WebView that clear is what tells the app to hand over a fresh token. Browser-tested 2026-10-02 against the sandbox project with a real manager sign-in: a junk stored token renews on reload, the timer renews after a simulated 56 minutes and the dashboard keeps loading, and a refused refresh token lands on `/login`. Not yet tried in a real tab left open overnight.

### C76. Off-hours work she finished on her phone never reached the after-hours ledger (former Open Gap O25)

- **Found / fixed:** 2026-10-02, while adding tick / untick to the app's "Lahat ng task ngayon" (client feedback: tasks done out of order).
- **Was:** only the web wrote task entries: `use-task-board.ts` `onComplete` → `use-ledger.ts` `record` → `insertLedgerEntryFn`, when a **manager** clicked Done, and only for `currentHelperId`. Nothing wrote one when the helper finished a task in `LINARA_MOBILE`, although the app told her an off-hours task "naka-log ito bilang rest owed".
- **Fix:** `supabase/add-ticket-ledger.sql` (**apply by hand after add-cancelled-tasks.sql and fix-helper-write-access.sql, and before the web change below is deployed**).
  - A trigger on `tickets`: a task becoming `done` gets one `ledger_entries` row (keyed by `associated_ticket_id`, unique) when it was finished off her shift, by the same rules as the web's `statusFor()` + `classify()`: quiet hours, rest day, break, outside her shift, approved rest off or leave; an emergency or off-hours task always counts. Household clock. Minutes from `actual_start` (or 5) to `actual_end`, clamped to now.
  - Going from `done` to anything else removes that entry, so an untick never leaves rest owed behind.
  - `SECURITY DEFINER`, so it runs on the helper's own update; she still can't write `ledger_entries` directly (C72).
  - **Web:** no longer records task entries itself (`onComplete` is now optional and unused), and refreshes the ledger on every ticket change. Quick Utos entries are still written by the web.
  - PGlite test: `supabase/tests/ticket-ledger.test.mjs` (17 checks, in `npm run test:sql`).
- **Residual:** between applying the SQL and deploying the web change, a manager's Done on the web counts twice; apply and deploy together. Quick Utos entries still only record for the first active helper (MULTI_HELPER_HANDLING.md, Ledger).

### C77. Every helper could change the whole pantry and palengke list; the manager couldn't say who keeps it

- **Found / fixed:** 2026-10-02, client feedback: "manager should be able to assign which staff can do mayor doma stuff ... or just someone to fulfil the checklist", since households trust staff differently.
- **Was:** `pantry_items` and `grocery_items` had one household-wide `FOR ALL` policy (C72's residual), and `LINARA_MOBILE` gave every helper the full Pantry tab: counts, items, the starter list, adding and removing palengke lines.
- **Fix:** `supabase/add-pantry-roles.sql` (**apply by hand, after fix-helper-write-access.sql, and before the web change is deployed**; with or without add-grocery-restock.sql).
  - `helper_profiles.pantry_role`: `lead` (in charge: everything, as before) or `runner` (buys from the list). New helpers start as runners; everyone employed when the SQL runs becomes a lead, so nobody loses anything that day. Any number of leads.
  - Every helper can say something ran out: the count goes to zero and the item goes on the list ("Ubos na"). No level without that.
  - `BEFORE` triggers hold a runner's own writes to exactly that, plus ticking lines bought and their cost. Writes from the restock trigger (`add-grocery-restock.sql`, C82) and `SECURITY DEFINER` functions pass. She can't raise her own role: `helper_profiles_guard_own_update` (C72) only lets her change her availability.
  - **Web:** People shows "Pantry: In charge / Buys from the list" on each helper, changeable by primary and co-managers (`updateHelperPantryRoleFn`). Hidden until the column exists.
  - **Mobile:** the Pantry tab hides adding, editing, counts and removing for a runner, and the starter list; she sees "Ubos na". Her role is its own read (`getMyPantryRole`), re-checked whenever she opens the tab, and falls back to `lead` while the column doesn't exist, so the app works whichever ships first.
  - PGlite test: `supabase/tests/pantry-roles.test.mjs` (23 checks, in `npm run test:sql`).
- **Residual:** a runner can still add a line for a pantry item with any quantity and tick it bought, which raises that item's count by that much. Only a count, and visible on the list, so left alone.

### C78. "Paid outside Linara" failed: its insert named a column that had been dropped

- **Found / fixed:** 2026-10-02, client feedback (screenshot: column "payout_reference_id" of relation "payslips" does not exist).
- **Was:** `add-payout-attempts.sql` drops `payslips.payout_reference_id`, but `record_offapp_payslip` in `add-pay-periods.sql` and `add-unpaid-leave-pay.sql` still inserted it. The PGlite tests kept the column in `base-schema.sql`, so they passed.
- **Fix:** both inserts no longer name it (if the column still exists, its default fills it). `pay-periods.test.mjs` and `unpaid-leave-pay.test.mjs` drop the column first, as production has it; without the fix they fail. **Apply `add-unpaid-leave-pay.sql`**, which was also never applied live (the End employment error `unpaid_leave_due(uuid, date, boolean) does not exist`, same report).

### C79. Service incentive leave was fixed to the law's minimum; the household couldn't be more generous

- **Found / fixed:** 2026-10-02, client feedback: "Recorded leave should be a toggle ... if they want to follow 1 year rule, rule should be custom to manager."
- **Fix:** `supabase/add-leave-policy.sql` (apply after `add-leave.sql`): `households.sil_waits_first_year` (default true, RA 10361) and `sil_days_per_year` (default 5, 5 to 30). Replaces `sil_service_year`, `sil_balance_days` and `leave_guard` with the household's rule; same signatures, so both apps' balances follow. People → Leave shows "Leave rules" for managers. The law is a floor: nothing can go below 5 days or past the first-year start. PGlite: `leave-policy.test.mjs` (14 checks).

### C80. A receipt could only be attached by completing a task titled "palengke"

- **Found / fixed:** 2026-10-02, client feedback: "Receipt attachment is not working."
- **Was:** LINARA_MOBILE showed a receipt button only inside an open task whose title matched "palengke"/"marketing run" (`getActivePalengkeTicket`), saving to `tickets.photo_evidence_url`. With no such task there was no way to add one, and the web's dashed "No receipt yet" looked like a button but only displayed that task's photo.
- **Fix:** `supabase/add-grocery-receipts.sql`: `grocery_receipts`, one row per receipt, task optional. The app's Pantry tab has a Resibo card whenever no run is open; a run's receipt is recorded there too. The web lists the latest six. PGlite: `grocery-receipts.test.mjs`.
- **Storage:** photos are shrunk on the phone to 1200px at 80% JPEG (about 150 to 300 KB). Retention (60 days for receipts) is O28.

### C81. "Start new day" moved the board to tomorrow, and the Pass couldn't look at another day

- **Found / fixed:** 2026-10-02, client feedback: unsure whether Start new day clears the board; couldn't move through dates on the Pass ("Pass features need to reflect what is on Schedule").
- **Was:** the manual button rolled the board to `board_date + 1` (cleared pending Quick Utos, spawned tomorrow's routines). Pressed during the day, the Pass then showed tomorrow (the client's read "Saturday, October 3" on Friday) and nothing brought it back.
- **Fix:** the manual button is gone; the automatic midnight rollover (C31) is unchanged. A `board_date` ahead of today snaps back on load. The Pass has ‹ › to step through days, showing that day's tasks the way Schedule loads them (`listTicketsBetweenFn`), with "Back to today". The header wraps on a phone instead of printing "End the day" over the date.

### C82. Bought palengke items never went into pantry stock (former Open Gap O23)

- **Found / fixed:** 2026-10-02, while reviewing client feedback ("Palengke items purchased, goes to Pantry stock"). Applied 2026-10-03.
- **Was:** `ARCHITECTURE.md` §9.2 says that when a helper completes a Palengke Run, the client sets `bought = true` and raises `pantry_items.qty`. Only the first half existed: nothing in either repo wrote `pantry_items.qty` from a purchase, although `grocery_items.pantry_item_id` links the two. Low-stock items stayed low after they were bought, so they were suggested again.
- **Fix:** `supabase/add-grocery-restock.sql`, a trigger on `grocery_items`. Ticking a linked item bought adds its `qty` to the pantry item; unticking takes it back off (never below 0). Items with no `pantry_item_id` are skipped, since they have no pantry row and their unit may not match. Ticked from the app, or from the web Pantry's Bought checkbox (QA LW-5). PGlite test: `supabase/tests/grocery-restock.test.mjs`.

### C83. Search and filters existed only on the Pantry and Grocery list (former Open Gap O32)

- **Found:** 2026-10-02, client feedback, logged 2026-10-03. **Fixed:** 2026-10-04 (web only, no SQL).
- **Was:** `ListFilter` was used by `pantry-section.tsx` and `grocery-section.tsx` only. The Schedule loads just the week or month on screen, so an old task could only be found by paging back through it.
- **Fix:** the Schedule (`task-planner.tsx`) has a search box and status chips (All / To do / Done / Cancelled). The chips narrow Week, By person and Month, alongside the person picker; routines still to come show under All and To do only, and appointments only when nothing is filtered. Typing two or more letters searches task titles and notes on **every date** (`searchTicketsFn`: newest first, the 50 most recent, with the same person and status), and the results replace the calendar until the box is cleared: grouped by day, a task opens as on the calendar, and "Show in week" jumps there. Checked against the sandbox project (case-insensitive match, person and status filters accepted). Tests in `task-planner.test.tsx`.
- **Not added, on purpose:** the Pass shows one day, and People a household's few helpers, so neither has a list long enough to search. Money's payslip history is per helper, about 24 a year; give it a year filter once a real helper has more than a year of payslips.

### C84. A manager couldn't attach a receipt from the web (former Open Gap O29)

- **Found:** 2026-10-02 (C80), logged 2026-10-03. **Fixed:** 2026-10-04 (web only, no SQL).
- **Was:** Receipts were added only in `LINARA_MOBILE`'s Pantry tab. The web's `receipt-slot.tsx` listed them with no upload, so a manager who did the shopping could tick items bought (LW-5) but not add the receipt.
- **Fix:** "Add receipt" under the grocery list's Receipt (a file picker; a phone offers the camera). `src/lib/shrink-photo.ts` re-encodes it in the browser the way the app does: 1200px at 80% JPEG plus a 480px, 70% thumbnail, through a canvas, so EXIF and GPS are dropped and the phone's rotation applied. `addGroceryReceiptFn` checks it's a JPEG under 3 MB, uploads it to `<household>/receipts/<ms>.jpg` and its `.thumb.jpg` (thumbnail best effort, as on the phone), and inserts the `grocery_receipts` row, removing the files if that fails. The existing storage and table policies already allowed a manager; the nightly purge (O28) deletes it after 60 days like any other.
- **Verified (2026-10-04):** `e2e/deep/receipts.spec.ts` (in `npm run qa:deep`) against the sandbox project from a local production build: the photo and thumbnail are stored, the row written, the receipt listed, then all three deleted.

### C85. No list view of tasks (former Open Gap O30)

- **Found:** 2026-10-02, client feedback ("list view", no more detail), logged 2026-10-03. **Fixed:** 2026-10-04 (web only).
- **Was:** the Schedule had Week, By person and Month; on a desktop the Week is seven narrow columns.
- **Fix (a default, chosen by the user without the client's detail):** a fourth Schedule view, **List** (`planner-list.tsx`): the same week, a full-width row per task, appointment and routine copy, grouped by day in time order. An empty day is one line, with Add on days still to come. The week arrows, person picker, status chips and search work as on the other views; tasks open the same dialog; nothing drags. Tests in `task-planner.test.tsx`.
- **Revisit** when the client says what the list is for (all upcoming? one helper's? longer than a week?). Each of those is a small change to the range or filter.

### C86. A helper could read every coworker's wage, payslips and vales (former Open Gap O45)

- **Found:** 2026-10-07, UX review of LINARA_MOBILE on Expo web as the e2e staff account (Kuya Marito): My Pay asked him to confirm ₱4,313 in cash that was recorded for Ate Marites. **Fixed:** 2026-10-07 (SQL applied by hand, plus a mobile filter).
- **Was:** the household read policies on `helper_profiles`, `payslips`, `vales`, `ledger_entries`, `rest_off_requests`, `leave_requests` and `payout_attempts` allowed any row whose helper is in `public.current_household_id()`. That returns `user_profiles.household_id`, which is set for helpers too, so every helper could read coworkers' wages (`monthly_rate`), payslips, vales, ledger, rest-off and leave requests (sick days included) and payout attempts. Before the fix the staff account saw 3 coworkers' profiles, 3 of their payslips, 1 vale and all 6 payout attempts. Writes were never affected: `acknowledge_offapp_payslip` checks `hp.user_id = auth.uid()`.
- **Fix:** `supabase/fix-helper-coworker-reads.sql`. Each household read branch also requires `current_user_type() IS DISTINCT FROM 'helper'`, so managers and remote admins read what they did before; helpers fall back to their own rows (`*_own_read`, with `vales_own_read` and `ledger_entries_own_read` new). No write policy changed. Coworkers' names and shifts still reach helpers through the SECURITY DEFINER `team_day` / `my_workplaces` / `family_households`, so no wage split was needed. Side effect: `quick_utos_isolation` and `invite_flags` now show a helper only her own rows, which is all the app reads. LINARA_MOBILE `getPaymentsAwaitingMe()` also filters to her own helper profiles (mobile `jamesDev-improved-ui`, c246c06), so the screen stays right if a policy regresses.
- **Verified (2026-10-07):** `supabase/tests/coworker-reads.test.mjs` (in `npm run test:sql`) in PGlite. Live against the sandbox after applying: the staff account sees 1 helper profile (its own), 4 payslips and 1 ledger entry (all its own), 0 vales and 0 payout attempts; the primary manager still sees 4 profiles, 7 payslips, 1 vale and 6 payout attempts, as before.

### C87. A bought pantry item went straight back on the grocery list, and suggestions added to a run lost their pantry link

- **Found / fixed:** 2026-10-07, checking runs and the pantry against the sandbox project (no SQL).
- **Was:** an item was low at or under its level (`qty <= par`), and both apps suggest buying `par - qty`. Buying exactly that left it at `par`, still low, so it went back into Needed (web) and showed "Paubos" again (mobile). Separately, "Add from Needed" on an existing run put a picked suggestion on through `addManual`, without its `pantry_item_id`, so buying it restocked nothing; Plan a run kept the link. The tested sandbox restock itself worked: ticking the linked toilet-roll line bought took its pantry count from 0 to 1, and unticking it back to 0.
- **Fix (user's choice of two):** low is now out, or under the level (`qty < par`), with one `needsBuying()` for the count, filter, sort and suggestions (web `pantry.utils.ts`, mobile `lib/pantry.ts`). The level reads "Keep at least" on the web and "Laging may" in the app, instead of "Buy more at" / "Bilhin kapag ... na lang". Suggestions added to a run go on through `addSuggestion(item, runId)` with their link. Moving lines onto or off a run now counts the rows changed and errors on a shortfall, rather than looking saved when the database skips a row. Unit tests in both repos; the run fix checked in a browser against the sandbox.

### C88. A grocery line typed by hand never restocked the pantry, even for a pantry item of that name (former Open Gap O46)

- **Found:** 2026-10-07, checking runs and the pantry against the sandbox project (see C87). **Fixed:** 2026-10-07, SQL applied by hand the same day.
- **Was:** only a `grocery_items` row with `pantry_item_id` restocks when bought (C82), and only lines added from a low pantry item had one. Lines typed by hand (Needed's add box, "Add a line" on a run, a lead's own line in LINARA_MOBILE) stayed unlinked, even "Rice Crackers" with a pantry item called Rice Crackers. They also didn't count as covering that item, so its suggestion still showed and it got listed twice.
- **Fix:** `supabase/add-grocery-pantry-link.sql`. A trigger links a not-yet-bought line with no pantry item to the one pantry item in its household with the same name and unit, ignoring case and spaces; no match, a different unit, or two items of that name leave it unlinked. An existing link is never changed. Applying it linked the unbought lines already listed. A runner still can't add a typed line (the runner guard runs first). Items with no pantry row (kangkong for tonight) don't create one, and a renamed line isn't unlinked.
- **Verified (2026-10-07):** PGlite `supabase/tests/grocery-pantry-link.test.mjs` (in `npm run test:sql`; `grocery-runs.test.mjs` loads it on top of the run guards). Live as the e2e manager: the typed Rice Crackers line was linked on apply, kangkong, bok choy and Kamatis stayed unlinked, and a new typed " TOILET roll" line linked itself to the pantry's toilet roll (then deleted). The duplicate Rice Crackers line from before (added 2026-10-07 beside the typed one) was deleted, so one linked line is left.

### C89. A signed-out visit to a manager page got the page (200) and waited for the browser to move it to log in (QA LM-4)

- **Found:** 2026-10-07, manual test LM-4 (`feedback_local/manual_feedback_test.txt`): on throttled 3G, `/manager/pass` opened in an incognito window showed the manager shell and a spinner for several seconds before landing on `/login`. **Fixed:** 2026-10-07 (web only, no SQL).
- **Was:** the session lives in `localStorage` (and the LINARA_MOBILE WebView writes the same `linara_manager_*` keys, O18), which a request never carries, so the server rendered `/manager/*` for everyone with a 200 and only the client's `RequireManagerAuth` moved a signed-out visitor on, once its scripts had loaded. The first fix (2026-10-07, `012c018`) stopped the bottom nav showing in that wait; the wait itself stayed.
- **Fix:** a `linara_signed_in=1` cookie (`src/lib/signed-in-cookie.ts`), set by `useSession` whenever a session is confirmed and cleared when there isn't one or on log out. `src/server.ts` answers a GET for `/manager` or `/manager/*` without it with a 307 to `/login`, before anything renders. The cookie holds no token and grants nothing; a stale one falls through to the client check as before. The WebView's first open hops once through `/login` (O18).
- **Verified (2026-10-07):** unit tests in `signed-in-cookie.test.ts`; e2e `public.spec.ts` checks every manager route answers a signed-out request with a 307 to `/login`, and the signed-in suites still pass (the saved session carries the cookie). Against a local production build: 307 without the cookie, 200 with it.
- **Also fixed:** `e2e/manager.spec.ts` and `e2e/deep/pantry.spec.ts` still looked for the old "Buy more at" label (C87 renamed it "Keep at least").

### C90. Login, sign-up and reset emails went through this site's server, so nothing slowed guessing or email floods (QA LM-A7, F4)

- **Found:** 2026-10-07, security QA (`feedback_local/feedback.txt`): LM-A7 (High), 12 of 12 wrong logins replayed against `/_serverFn` all answered at once, no 429; F4 (Medium), the reset request could be looped to use up the project's email allowance, with a `redirectTo` the browser chose. **Fixed:** 2026-10-07 (web only, no SQL).
- **Was:** `managerLoginFn`, `managerSignUpFn` and `requestPasswordResetFn` called Supabase Auth from the server, so Auth's per-IP limits only ever saw Vercel's addresses: an attacker wasn't slowed, and could get every manager's login throttled at once. They also signed in on the shared module-level `supabaseClient`.
- **Fix:** the browser calls Supabase Auth itself (`src/features/people/people.auth.ts`, a throwaway client per call): sign-in, sign-up and the reset email. What comes after stays on the server with the session it got: `resolveManagerLoginFn` (who the account is) and `setUpNewManagerFn` (join with a code, or bootstrap a household). Auth's limits now apply to the visitor's own IP; a throttled try says "Too many tries. Wait a few minutes, then try again." Supabase already only links reset emails to URLs on the project's Redirect URLs allow-list (anything else falls back to the Site URL) and allows one email a minute per address.
- **Verified (2026-10-07):** against the sandbox from one machine, the 33rd wrong-password sign-in straight to Auth got `429 over_request_rate_limit` (about 30 per 5 minutes per IP). The e2e suite signs in through the new path (53 passed; 4 skipped for want of test data). A Playwright check saw the reset page call `supabase.co/auth/v1/recover` from the browser, with no server function.
- **Not done, on purpose:** a per-account lockout. It would let anyone lock a manager out by guessing their email; per-IP limits stop one machine, and a stronger minimum password (now 6, set in Supabase Auth > Policies) is the account-side defence.

### C91. Pages could be framed by another site, and sent no nosniff or referrer policy (QA LM-A8)

- **Found:** 2026-10-07, security QA LM-A8 (Medium): only `Strict-Transport-Security` came back, and `/login` loaded inside an iframe on a `file://` page. **Fixed:** 2026-10-07 (web only).
- **Fix:** `src/server.ts` adds `src/lib/security-headers.ts` to every response it serves, redirects and error pages included: `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. The LINARA_MOBILE WebView loads the dashboard as the whole page, not a frame, so it isn't affected. Static JS and CSS files are served by Vercel directly and don't pass through it; they're never framed and carry the right types. The full CSP is O48.
- **Verified (2026-10-07):** unit tests in `security-headers.test.ts`; against a local production build, `/login` (200), `/manager/pass` (307) and an unknown page (404) all carry the four headers.

---

## Template for New Entries

```markdown
### N. Short title of the mismatch

- **Found:** YYYY-MM-DD, while building `<repo>` Story `<N>` (`<what you were doing>`).
- **What's missing:** What the docs/roadmap describe vs. what the schema/code actually has. Cite files.
- **Blocks:** What future story or feature this will hit, if anything. Link the roadmap file if one exists.
- **Current workaround:** What you actually shipped instead, and where.
- **To close:** What a real fix would require, and which repo owns making it (schema changes are `LINARA`'s call per `AGENTS.md`).
```
