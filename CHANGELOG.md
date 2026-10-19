# Changelog

All notable changes to the Linara web app. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## 2026-10-19

### Added

- Plan & billing at `/manager/plan`: current plan and seats, a plan picker with a live quote, and
  payment through Xendit's hosted Payment Sessions page. Return page at `/billing/return`. Nothing
  renews automatically. Checkout is off unless `PLATFORM_BILLING=on` and `XENDIT_SECRET_WRITE_KEY`
  are both set.
- Public `/pricing` lists the plans published in the console.
- Public `/faq`, with a checked-in fallback, and a help chat with Linara support at `/manager/help`.
- Seat limits enforced in the database for helpers and managers (`supabase/add-seat-limits.sql`,
  applied after LINARA_ADMIN 015 to 017); a lapsed plan costs new seats only, never access.
- Edge function `xendit-session-webhook` records `payment_session.completed` and
  `payment_session.expired`; the six AI functions record their usage once a real provider is
  switched on. Both call RPCs that live in LINARA_ADMIN (017, 018).
- `docs/OPERATOR-GO-LIVE.md`, the owner's ordered two-repo checklist and live checks.
- Playwright: the new public pages load cleanly, and `/manager/plan` and `/manager/help` send a
  signed-out visitor to `/login` with a 307.

### Changed

- Terms of service gains a "Plans and payments" section and the privacy policy says that a buyer's
  name and email go to Xendit; both updated October 19, 2026 and awaiting owner review (O69).
- Business console features live in LINARA_ADMIN (015–020).

### Known gaps

- The SQL is built, not applied (O58 to O64).
- Xendit bills legacy API use (`/v2/payouts`, `/v2/invoices`) from 2026-10-01; payouts are off, so
  nothing is billed today (O65).
- Transcription cost reads as zero until `transcribe-notes` reports clip length (O66).
