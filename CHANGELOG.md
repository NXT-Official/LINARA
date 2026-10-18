# Changelog

All notable changes to the Linara web app. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## 2026-10-19

### Added

- Plans: a Linara admin prices plans (monthly, yearly or one-time; a flat fee, per extra helper,
  per manager or per home) at `/admin/plans`; the published ones show at `/pricing`.
- Plan & billing at `/manager/plan`: current plan and seats, a plan picker with a live quote, and
  payment through Xendit's hosted Payment Sessions page. Return page at `/billing/return`. Nothing
  renews automatically. Checkout is off unless `PLATFORM_BILLING=on` and `XENDIT_SECRET_WRITE_KEY`
  are both set.
- Edge function `xendit-session-webhook` records `payment_session.completed` and
  `payment_session.expired`.
- Seat limits enforced in the database for helpers and managers; a lapsed plan costs new seats
  only, never access.
- Linara admin area `/admin`: overview (revenue, COGS, AI cost, cost per AI call, profit, profit
  per user), households, plans, costs, support inbox and FAQs. Admins are added from the SQL
  editor only.
- Support chat between a household and the admin at `/manager/help` and `/admin/support`.
- FAQs maintained at `/admin/faqs` and public at `/faq`, with a checked-in fallback.
- AI usage and cost recorded by the six AI functions once a real provider is switched on.
- Seven SQL files to apply by hand, in order: `add-platform-admins.sql`, `add-plans.sql`,
  `add-subscriptions.sql`, `add-seat-limits.sql`, `add-costs-and-ai-usage.sql`,
  `add-support-chat.sql`, `add-faqs.sql`.
- `docs/OPERATOR-GO-LIVE.md`, the owner's ordered checklist and live checks.
- Playwright: the new public pages load cleanly, and `/manager/plan`, `/manager/help` and the
  `/admin` pages send a signed-out visitor to `/login` with a 307.

### Changed

- Terms of service gains a "Plans and payments" section and the privacy policy says that a buyer's
  name and email go to Xendit; both updated October 19, 2026 and awaiting owner review (O69).

### Known gaps

- The SQL above is built, not applied (O58 to O64).
- Xendit bills legacy API use (`/v2/payouts`, `/v2/invoices`) from 2026-10-01; payouts are off, so
  nothing is billed today (O65).
- Transcription cost reads as zero until `transcribe-notes` reports clip length (O66).
