---
name: Linara
description: Home, made clear. The manager's view of a Filipino household run on fair terms.
colors:
  pine: "oklch(0.42 0.055 180)"
  pine-deep: "oklch(0.32 0.05 180)"
  terracotta: "oklch(0.73 0.11 55)"
  terracotta-soft: "oklch(0.88 0.055 60)"
  terracotta-ink: "oklch(0.52 0.12 48)"
  sand: "oklch(0.965 0.018 82)"
  sand-deep: "oklch(0.93 0.022 82)"
  card-cream: "oklch(0.99 0.008 82)"
  ink: "oklch(0.22 0.015 180)"
  muted-ink: "oklch(0.5 0.02 180)"
  hearth-ink: "oklch(0.28 0.045 50)"
  border-warm: "oklch(0.88 0.02 82)"
  input-warm: "oklch(0.9 0.02 82)"
  destructive: "oklch(0.55 0.18 27)"
typography:
  display:
    fontFamily: "Literata, ui-serif, Georgia, serif"
    fontSize: "clamp(3rem, 6vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Literata, ui-serif, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Literata, ui-serif, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Nunito Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Nunito Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.125rem
  wordmark:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  3xl: "24px"
  full: "9999px"
spacing:
  gutter-phone: "16px"
  gutter-wide: "24px"
  section-gap: "24px"
  card-pad: "20px"
  card-pad-wide: "28px"
  row-pad: "14px"
components:
  button-primary:
    backgroundColor: "{colors.pine}"
    textColor: "{colors.card-cream}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.pine-deep}"
  button-secondary:
    backgroundColor: "{colors.card-cream}"
    textColor: "{colors.pine}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  button-danger:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.card-cream}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.card-cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.3xl}"
    padding: "20px"
  input:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "10px 12px"
  chip-status:
    backgroundColor: "{colors.sand-deep}"
    textColor: "{colors.pine-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  nav-tab-active:
    backgroundColor: "{colors.sand-deep}"
    textColor: "{colors.pine}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
---

# Design System: Linara

## Overview

**Creative North Star: "The Tidy Morning Home"**

Linara should feel like walking into a home at seven in the morning after
someone has already tidied it: natural light on sand-coloured walls, everything
in its place, nothing asking for attention unless it genuinely needs you. The
brand doc says it plainly: a tidy, calm home, not a control panel. The manager
opens the Pass between other things; the screen's job is to be read in a glance
and put down again.

The palette is warm daylight (sand and cream) anchored by one calm pine-teal
and a single terracotta-gold accent for hearth warmth. Type pairs a warm serif
for headings with a humanist sans for everything that is read or tapped. Depth
is soft and quiet; shapes are soft-cornered but not bubbly. Density is moderate:
one surface per section, divided rows inside it, generous space between
sections.

This is a refinement of the shipped app, recorded on 2026-09-30 after the
Impeccable polish pass. It explicitly rejects the generated-UI look the app
started from: sparkle icons as a logo, uppercase letter-spaced eyebrows above
headings, cards nested inside cards, pills for every shape, a coloured stripe
down one side of a card, and reassuring filler copy the data doesn't support.

**Key Characteristics:**
- Warm sand ground, cream surfaces, one pine anchor, one terracotta accent.
- Literata headings, Nunito Sans body; nothing below 13px.
- One surface per section; rows separated by hairlines, never cards in cards.
- Soft ambient shadow at rest; real lift only for things floating above.
- Soft rectangles for actions, pills only for status.

## Colors

Warm daylight neutrals with one cool anchor and one warm accent, all in OKLCH.

### Primary
- **Pine** (`pine`): the anchor. Primary buttons, the active nav tab's icon and
  label, focus rings, the logomark tile, links. Order and trust; pointedly not
  fintech blue.
- **Deep Pine** (`pine-deep`): primary button hover, text on the sand-deep
  secondary surface, chip text.

### Secondary
- **Terracotta** (`terracotta`): hearth warmth, used sparingly. The "doing"
  status dot, the NOW marker, the logomark check, fills and strokes. Never for
  words: it is 2.2:1 on sand.
- **Soft Terracotta** (`terracotta-soft`): the Needs You tint and gentle
  attention washes (pending invites, off-shift warnings).
- **Terracotta Ink** (`terracotta-ink`): terracotta for text on light surfaces
  (5.2:1 or better): rest owed, pending status labels, the landing hero's
  second line.
- **Hearth Ink** (`hearth-ink`): text on terracotta fills and tints (about 6:1
  on solid, 12:1 on tints).

### Neutral
- **Morning Sand** (`sand`): the page background, and input fills.
- **Deep Sand** (`sand-deep`): secondary surface: active nav tab, status chips,
  muted wells.
- **Cream** (`card-cream`): every card, modal and sheet surface; text on pine.
- **Ink** (`ink`): body text and headings.
- **Muted Ink** (`muted-ink`): secondary text, helper copy, inactive nav.
- **Warm Border** (`border-warm`) and **Warm Input** (`input-warm`): hairline
  dividers, card and input strokes.
- **Destructive** (`destructive`): errors and irreversible actions (Cancel
  task, payout needs review). 5.2:1 both as text on cream and under cream text.

### Status
Semantic status tokens in `src/styles.css`. The `-ink` value is for text, on
cream and on its own `-soft` tint; the bare value is for fills, bars and dots
only.
- **Done** (`status-done`, `status-done-soft`, `status-done-ink`): done,
  paid, approved, on shift, on track.
- **Late** (`status-late`, `status-late-soft`, `status-late-ink`): overdue,
  late, needs you, over budget, petty cash that doesn't add up, a payout
  needing review, pay below the legal minimum, emergencies.
- Gentler warnings (off-shift, "send anyway", check before paying) use the
  Soft Terracotta wash with Hearth Ink text, and "doing" uses terracotta, as
  above. Errors and failures stay Destructive.

Team and role colours (`teams.constants.ts`, `people.constants.ts`) are
categories, not status, and keep their own hues. Nothing else hard-codes a
colour or uses Tailwind's stock palette (emerald, amber, red).

### Named Rules
**The One Hearth Rule.** Terracotta is the only warm accent, and it marks
attention or warmth, never decoration. If a screen has more terracotta than
pine, something is wrong.

**The Readable Accent Rule.** Plain terracotta never carries words. Text uses
Terracotta Ink on light surfaces and Hearth Ink on terracotta.

## Typography

**Display Font:** Literata (with Georgia, serif)
**Body Font:** Nunito Sans (with system-ui, sans-serif)
**Wordmark:** Fraunces, for the "linara" logotype only

**Character:** a warm, bookish serif that stays sturdy at small sizes thanks to
its optical sizing, paired with a rounded humanist sans that reads kindly. The
brand doc's "premium but human, never techy-sharp".

### Hierarchy
- **Display** (600, 48–72px, 1.1): the landing hero only.
- **Headline** (400, 24px, 1.25): the Pass date, and page-level section heads
  such as Routines and Shifts.
- **Title** (400, 20px, 1.4): section and card headings (The Line,
  Appointments, Admins, Helpers), and modal titles.
- **Body** (400, 14px, 1.43): everything read: task titles, descriptions, notes.
- **Label** (600, 13px, 18px line height, sentence case): field labels, stat
  labels, chips, nav labels, metadata.

### Named Rules
**The 13px Floor.** Nothing in the app is smaller than 13px. The theme's
smallest size (`text-xs`) is 13px, and arbitrary smaller sizes are not used.

**The No-Eyebrow Rule.** No uppercase, letter-spaced label above a heading.
The heading carries its own weight. Labels are sentence case at label weight;
the only tracked text is a code meant to be read out character by character
(the invite code).

## Layout

One centred column, 1152px maximum (`max-w-6xl`), with a 16px gutter on phones
and 24px from `sm` (640px). Sections stack 24px apart. Cards pad 20px on phones
and 28px wide. Inside a card, related rows sit 14px apart, split by hairline
dividers rather than their own boxes. The Pass's spend and payday cards pair up
two-across from `sm`.

Phone-first: every flow works one-handed at 390px. Below `lg` the page pads
96px at the bottom so content always clears the tab bar. The header is a
single row on a phone and on a desktop. The tagline appears from `md`, steps
aside between `lg` and `xl` while the header carries the pages, and the
View-as switcher only when a household has more than one admin.

## Elevation & Depth

Soft and quiet. Surfaces rest on the sand ground with a faint ambient shadow
that reads more as a paper edge than a lift. Real elevation is reserved for
things that float above the page: modals and sheets, and the nav dock on
tablet widths. Layering, top to bottom: toasts, modals (z-50), the bottom nav (z-40),
the sticky header (z-30).

### Shadow Vocabulary
- **Soft** (`shadow-soft`): every card at rest. A 2px blur tinted pine-ink at
  5%, plus a cream inner top highlight.
- **Lift** (`shadow-lift`): modals, sheets, the tablet nav dock. A 32px
  blur at 8%.

### Named Rules
**The Paper, Not Plastic Rule.** A card's shadow should be barely noticeable.
If you can see the shadow before you see the card's content, it's too strong.
Only floating layers lift.

## Shapes

Soft corners on a 12px base radius. Sections and cards are 24px; inputs 16px;
buttons and nav tabs 12px; segmented controls 16px holding 12px segments. Full
round is reserved for things that are round by nature: status chips and counts,
avatars, dots, icon-only buttons (close, delete), and the logomark's own
geometry. Phone sheets round only their top corners and sit flush to the bottom
edge.

**The Pills-Mean-Status Rule.** If it's a pill, it tells you a state (Active,
Invited, 3 to buy, Coming up). If you can tap it to do something, it's a soft
rectangle.

## Components

### Buttons
Warm and steady: clearly labelled, unhurried, no bounce.
- **Shape:** gently rounded rectangle (12px).
- **Primary:** Pine fill, Cream label at label weight, 8px by 14px padding,
  optional leading 14px icon. Hover deepens to Deep Pine.
- **Secondary:** Cream fill, Pine label, a Pine hairline at 30% opacity.
  Hover washes Pine at 5%.
- **Danger:** Destructive fill, Cream label; only as the confirming step of an
  irreversible action, never as the first tap.
- **Icon-only:** round, Muted Ink, a Deep Sand wash on hover; always carries an
  aria-label.

### Chips
- **Status:** full pill, Deep Sand or a status tint, label weight. Never
  tappable.
- **Suggestion chips** (Quick Utos presets): soft rectangles, since they act.

### Cards / Containers
- **Corner Style:** 24px.
- **Background:** Cream on the Morning Sand page. The Needs You section uses a
  Soft Terracotta wash when something is waiting.
- **Shadow Strategy:** Soft at rest (see Elevation & Depth).
- **Border:** optional hairline in Warm Border.
- **Internal Padding:** 20px, 28px wide. Rows inside are 14px apart with
  dividers, never boxed.

### Inputs / Fields
- **Style:** Morning Sand fill, Warm Input stroke, 16px corners, 14px text.
- **Label:** above the field, sentence case, label weight, Muted Ink.
- **Focus:** the stroke shifts to Pine.

### Navigation
- **Phone:** a standard tab bar, full width and flush to the bottom edge, with
  the home-indicator inset inside it. Cream at 95% with blur, and a hairline
  top border.
- **Tablet (`sm` to `lg`):** a centred dock with 16px corners and Lift.
- **Desktop (`lg` and up):** the five pages sit in the header beside the logo,
  icon beside a 14px label, and there is no bottom bar. A floating phone tab
  bar on a monitor was the odd one out (UX review 2026-10-07).
- **Tabs:** icon over a 13px label. Active is a Deep Sand tile, Pine icon and
  heavier label (in the header, the tile and Pine text), so the active page is
  never shown by colour alone.

### Modals and Sheets
The shared Modal: a bottom sheet on phones (top corners 24px, flush to the
edge, home-indicator inset inside), a centred card from `sm`. Capped to the
viewport and scrolling inside itself, so its buttons are always reachable.
Escape closes; tapping the backdrop does not close a form.

### Logomark
The pine tile with a cream "i" whose dot lifts into a terracotta check and
roofline: done, and home. It is interim until a designer delivers the final
mark. It is drawn from tokens, so it always matches the palette.

## Do's and Don'ts

### Do:
- **Do** keep one surface per section, and split its rows with hairlines.
- **Do** use Pine for the one primary action on a screen area, and Secondary
  buttons for everything else.
- **Do** say only what the data supports: "Nothing on today's board yet", not
  "A calm morning, everyone is at their station".
- **Do** name the helper in copy ("Marites's next shift"); never assume a
  pronoun.
- **Do** check contrast: 4.5:1 for text, using Terracotta Ink or Hearth Ink
  whenever terracotta and words meet.
- **Do** open every overlay through the shared Modal.

### Don't:
- **Don't** use sparkles, or any emoji, as an icon or a logo.
- **Don't** put an uppercase, letter-spaced eyebrow above a heading.
- **Don't** nest a bordered or shadowed card inside another card.
- **Don't** add a coloured stripe down one side of a card.
- **Don't** make a tappable thing a pill, or a status a button.
- **Don't** go below 13px, or use arbitrary text sizes.
- **Don't** show progress rings or big numbers standing in for content. A
  spend bar is fine when there is a budget to fill.
