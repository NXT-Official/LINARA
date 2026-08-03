# Story 17: Visual CSS Polishing and PWA Readiness

## Objective

Polishing the visual UI, adding fluid transitions, loading the custom typography stack (Fraunces + Nunito Sans), configuring PWA manifests for mobile devices, and executing end-to-end regression tests.

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 1.1 & 15
- Architecture Spec: [`architecture.md`](../architecture.md) Section 1.2, 5.4 & 11.2
- Legacy Spec: [`original-ARCHITECTURE.md`](../original-ARCHITECTURE.md) Section 1 & 7

## Dependencies

- [`Story_16_ComplianceAuditWagesAndFintechPreviews.md`](Story_16_ComplianceAuditWagesAndFintechPreviews.md)

## Explicit Inputs

- File: [`src/styles.css`](../src/styles.css)
- File: [`src/routes/__root.tsx`](../src/routes/__root.tsx)

## Step-by-Step Implementation Instructions

1.  **Typography Loading:** Audit [`src/routes/__root.tsx`](../src/routes/__root.tsx). Ensure the serif heading font (**Fraunces**) and the humanist body font (**Nunito Sans**) load successfully via Google Fonts links in the HTML header shell.
2.  **Apply Color Tokens:** Check [`src/styles.css`](../src/styles.css). Declare custom color tokens (`--pine-teal`, `--sand`, `--card-cream`, `--terracotta-gold`) and map them across Tailwind v4 themes.
3.  **Add Fluid Transitions:** Apply smooth transitions, micro-interactions, rounded corners, and soft card shadow styles. Ensure all page loads have a "calm home, not corporate control" vibe.
4.  **Configure PWA:** Create a standard PWA manifest file `public/manifest.json` with app names, pine-teal theme colors, and icons. Add basic install-prompt cues to allow helpers to place Linara as a home screen icon.
5.  **E2E Integration Verification:** Execute complete multi-persona walk-through smoke checks (Invite -> Claim handshake -> AI SOP creation -> Quick Utos alerts -> Overnight hard-off gating -> Receipt uploads -> Paid).

## Expected Output

- Polished visual screens with responsive layouts and PWA installation support.
- File: `public/manifest.json`

## Testable Acceptance Criteria

1.  All headings render in Fraunces serif typeface, and buttons/texts use Nunito Sans.
2.  Tapping "Add to Home Screen" works on Android/iOS mobile browsers via manifest link configurations.
3.  All pages compile perfectly, and smoke flows execute with no console or design regressions.

## Done Definition

The typography stack and visual colors are applied, PWA manifests are configured, and a complete multi-persona verification check completes successfully.
