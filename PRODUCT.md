# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

This repo is the manager-facing web app (installable as a PWA). The helper-facing
Worker's Station is a separate native app in `../LINARA_MOBILE` (Expo); both share
one Supabase project, and this repo owns the schema. See `AGENTS.md`.

## Users

Three kinds of household manager use this app, and design decisions weigh them
equally (confirmed 2026-09-30) rather than favouring one:

- **The on-site working parent** — usually one half of a dual-income couple in
  Metro Manila. On a phone between other things; wants a glance and a quick
  decision, not to micro-assign the day.
- **The OFW parent abroad** — funds and oversees the home from the Gulf, Hong
  Kong or Singapore. Wants presence (the day happening, Done photos), the money
  accounted for, and vale approvals — without hovering or undercutting whoever
  is on site.
- **The relative managing on someone's behalf** — often a lola or other family
  member running the house for an OFW parent; may be less comfortable with apps.

The kasambahay (yaya, cook, driver, all-around) is a first-class user of the
product but never of this app: her side is `LINARA_MOBILE`. Every manager-facing
choice still has to hold up if she saw it.

## Product Purpose

An operating system for the Filipino household, where a family and the people
who help run it manage work, pay and care together, on fair terms. It turns an
informal cash-and-memory arrangement into something structured, compliant and
dignified for both sides: the family runs the home with less friction and less
guilt, and the worker is paid right, on time, with a record that is hers.

Success for the manager: the day runs without "did you do it yet?"; the Pass is
read-mostly; the only things demanding attention are in Needs You.

## Positioning

Two-sided and dignity-first, built for how Filipino homes actually work. Chore
apps ignore the worker; hiring marketplaces solve finding help, not running the
relationship; the real incumbent is cash, memory and a group chat. Linara's
mechanism a manager-only tool can't copy: the worker owns her login and her
record, sees the same numbers the family sees (pay, vale, rest owed), and the
product protects her rest — the board closes for the night, off-hours reaches go
through a friction wall and are logged as rest owed.

## Operating Context

- A restaurant kitchen for the home: tickets (tasks), stations (Yaya, Cook,
  Laundry, Driver, House), standards (SOPs), stock (pantry → palengke list),
  and the manager at the pass.
- Manager tabs: **Pass** (today: status, Needs You, the Line / the Board),
  **Schedule** (shifts, Quick Utos, routines, appointments), **Pantry**,
  **Money** (petty cash, payroll and payouts, rest owed, vales), **People**
  (admins, helpers, invites).
- Day-by-day: the Pass is about today only. Unfinished tasks carry over as past
  due; later-dated tasks sit in "Coming up" and count toward nothing today.
- Filipino household specifics are the spec: vale (cash advance), 13th month,
  live-in vs. live-out, palengke budgets, SSS/PhilHealth/Pag-IBIG, Batas
  Kasambahay (RA 10361), GCash/Maya payouts, OFW distance.
- Admin roles: primary manager, co-manager, remote (OFW) admin with a bounded
  permission set (suggests tasks for approval; cannot edit schedules or reach a
  helper off-hours).

## Capabilities and Constraints

- Built: tasks and routines, anchor-based appointments with prep tasks, Quick
  Utos with an availability friction wall, the after-hours ledger (rest owed,
  redeemable as time off), pantry and grocery list, payslips with statutory
  split and Xendit payouts (sandbox), invite/claim handshake.
- Rest owed is time, not money: after-hours work accrues minutes of rest that
  the helper redeems; there is no peso path.
- **Language — decided 2026-09-30, not yet built:** the manager app will offer
  an English / Filipino toggle. Today it is English with Taglish moments.
- AI features (SOP drafting, natural-language scheduling, utos routing) run on
  built-in mocks; no live provider is chosen yet. Deliberately deferred.
- Legal figures (wages, contributions, premiums) must stay configurable and be
  confirmed with counsel before any external claim.
- Open product gaps are tracked in `KNOWN_GAPS.md`; check it before claiming a
  capability.

## Brand Commitments

- Name: **Linara** (app) / **Linara Home** (product and entity), from *linaw*,
  "clarity". Lowercase wordmark. Not boss-coded: a word the worker can own.
- Taglines: "Home, made clear." (lead); "Everything clear. Everyone counted."
- Voice: calm, clear, kind. Verbs of ease ("handled", "sorted", "set",
  "ready"), never command ("assign", "monitor", "enforce"). Plain, not clever.
  The worker's side is never colder than the family's. Name the helper rather
  than assume a pronoun.
- Logomark: the dot of the "i" lifting into a check that becomes a roofline —
  done, and home. The current mark is interim (`src/components/shared/logo.tsx`,
  `public/icon-*.png`) until a designer delivers the final one.
- Source documents: `Resources/LINARA Brand/linara-brand-and-gtm.pdf` (brand &
  GTM) and `home-management-concept.md` (concept). Where they disagree on
  visual matters, the shipped app follows the brand doc; the concept doc §15
  records the difference.

## Evidence on Hand

- The upcoming demo is for investors / an accelerator, prospective pilot
  households, and internal team review.
- The Supabase project holds sandbox data only: **no real household is
  onboarded**, and the Xendit account is sandbox. There are no customers,
  testimonials, usage metrics or pricing yet — none may be fabricated.
- Market figures in the brand doc (DOLE–PSA: ~1.4M kasambahay, ~2.5% with
  written contracts, ~83% without social security) are marked "directional,
  refresh before external use".

## Product Principles

1. **Clarity, not control.** Remove ambiguity; never build a surveillance
   panel. Availability is a live signal, never a scored metric.
2. **Dignity by design.** The worker is a user, never a subject; the manager
   screen shows only what she could see too.
3. **Records that travel.** Her history and pay belong to her.
4. **Built for real Filipino homes.** Local reality is the spec.
5. **Honest state.** The app says only what the data supports — no reassuring
   filler, no counts that include tomorrow.

## Accessibility & Inclusion

- Managers include less app-confident relatives: 13px minimum text, clear
  labels, forgiving flows, WCAG AA contrast.
- Phone-first: every flow must work one-handed at 390px, above the tab bar and
  clear of the home indicator.
- Bilingual English / Filipino (decided, not yet built).
