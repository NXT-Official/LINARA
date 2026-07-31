# Linara — Architecture & Technical Overview

> Linara is a calm, shared home-management prototype for Filipino households — designed to coordinate between family members (Primary manager, Co-manager, Remote admin/OFW) and household helpers (yaya, cook, driver, laundry, all-around). This document describes the full tech stack, folder layout, data model, and execution model of the current codebase.

**Status:** Front-end-only prototype. All data lives in React state; there is no database, no login, no network calls. Refreshing the page resets everything.

---

## 1. Tech Stack

### Runtime & framework

- **React 19** with the new JSX runtime (`react-jsx`).
- **TanStack Start v1** — full-stack React framework built on **Vite 8**. Provides SSR shell, file-based routing, and (unused here) server functions.
- **TanStack Router v1** — type-safe, file-based router. Generates `src/routeTree.gen.ts` from files under `src/routes/`.
- **TanStack Query v5** — QueryClient is wired into the router context via `src/router.tsx` and provided in `__root.tsx`, but the app currently uses local `useState` for all data (no queries defined yet).
- **TypeScript 5.8** in `strict` mode. Path alias `@/* → src/*`.

### Styling

- **Tailwind CSS v4** via `@tailwindcss/vite` (native `@import` + `@theme` in `src/styles.css`, no legacy `tailwind.config.js`).
- **shadcn/ui** components (Radix UI primitives) generated under `src/components/ui/`.
- **`tw-animate-css`**, **`class-variance-authority`**, **`clsx`**, **`tailwind-merge`** for variant/composition utilities.
- **`lucide-react`** for icons.
- **Fonts:** Fraunces (serif headings) + Nunito Sans (humanist body), loaded via `<link>` in `__root.tsx` head.

### UI / Interaction libraries (installed, mostly via shadcn)

- Radix UI: dialog, dropdown, popover, select, tabs, tooltip, switch, checkbox, slider, radio-group, scroll-area, accordion, avatar, etc.
- `sonner` (toasts), `cmdk` (command palette), `vaul` (drawer), `input-otp`, `embla-carousel-react`, `react-day-picker`, `recharts`, `react-hook-form`.

### Backend runtime (available, barely used)

- **Nitro v3** (`nitro/vite`) builds the deployable server into `.output/` — default preset is a portable Node/Bun server; set `NITRO_PRESET` for a platform target.
- `src/server.ts` wraps the Start SSR entry to turn catastrophic SSR failures into a readable HTML error page instead of an h3 JSON 500.
- **`@tanstack/react-start` `createServerFn`** and server routes under `src/routes/api/` are available for future backend work but nothing is defined yet.

### Tooling

- **Bun** as package manager (`bunfig.toml`).
- **ESLint 9** flat config + Prettier.
- **Vite 8** dev server on port 8080.
- **`vite.config.ts`** registers, in order: `@tailwindcss/vite`, `nitro/vite`, `@tanstack/react-start/plugin/vite`, `@vitejs/plugin-react`. The `@/*` alias comes from Vite 8's native `resolve.tsconfigPaths`, reading `tsconfig.json`. No config wrappers or presets.

### Design system (brand tokens)

- Pine-teal `#1F5A54` (primary), sand `#F7F3EC` (app background), card cream `#FDFBF6`, terracotta-gold `#D99A6C` (accent).
- Serif headings (Fraunces), humanist sans body (Nunito Sans), rounded corners, generous spacing — deliberately calm, non-corporate.

---

## 2. Folder Structure

```
.
├── ARCHITECTURE.md              ← this file
├── AGENTS.md                    ← agent-facing notes
├── README.md                    ← setup, scripts, deployment
├── package.json                 ← Bun-managed deps
├── vite.config.ts               ← Tailwind + Nitro + Start + React plugins
├── tsconfig.json                ← strict TS, @/* alias
├── components.json              ← shadcn/ui config
├── eslint.config.js
├── .editorconfig, .prettierrc.json, .prettierignore, .env.example, .gitignore, bunfig.toml
└── src/
    ├── router.tsx               ← getRouter(): QueryClient + createRouter
    ├── server.ts                ← Nitro SSR entry wrapper (error reporting)
    ├── start.ts                 ← TanStack Start client boot
    ├── styles.css               ← Tailwind v4 @theme tokens + globals
    ├── routeTree.gen.ts         ← AUTO-GENERATED — do not edit
    ├── routes/
    │   ├── README.md            ← routing conventions cheat-sheet
    │   ├── __root.tsx           ← root layout, <html>/<head>, providers, SEO meta
    │   └── index.tsx            ← ENTIRE APP (~5700 lines, single-file prototype)
    ├── components/
    │   └── ui/                  ← shadcn primitives (button, card, dialog, …)
    ├── hooks/
    │   └── use-mobile.tsx
    └── lib/
        ├── utils.ts             ← cn() helper
        ├── error-capture.ts     ← records the original error h3 swallows during SSR
        └── error-page.ts        ← static HTML fallback for a failed SSR render
```

### Why one big `index.tsx`?

This is an interactive prototype exploring product shape (roles, flows, tone). Keeping everything in one file lets multi-role state (managers ↔ helper ↔ remote admin) stay trivially in sync and lets the design iterate fast. A production split would extract the components in Section 5 into `src/features/*` folders backed by real data.

---

## 3. Routing & App Shell

- **File-based routing** under `src/routes/` — dots become slashes, `$param` is dynamic, `_prefix` is a pathless layout. See `src/routes/README.md`.
- Only two routes exist:
  - `src/routes/__root.tsx` — HTML shell (`<html><head><body>`), `QueryClientProvider`, favicon, Google Fonts `<link>`, SEO meta (title, description, og:\*, twitter:card), and the required global `notFoundComponent` + `errorComponent` boundaries. Renders `<Outlet />`.
  - `src/routes/index.tsx` — the `/` route that renders the entire Linara prototype (`<LinaraApp />`).
- Router config lives in `src/router.tsx`: instantiates a `QueryClient`, passes it to the router context (`createRootRouteWithContext<{ queryClient }>`), and sets `defaultPreloadStaleTime: 0` and `scrollRestoration: true`.

---

## 4. Data Model (types in `src/routes/index.tsx`)

All types are local to the single route file. Grouped by concern:

### People & roles

```ts
type Station = "Yaya" | "Cook" | "Laundry" | "Driver" | "House";
type Helper  = { id; name; short; initials; station; ... };
type AdminType = "primary" | "co" | "remote";
type Admin     = { id; name; short; initials; type; location };
type ViewAs    = "ben" | "tina" | "lolafe" | "rosa";   // demo persona switcher
```

### Tasks & scheduling

```ts
type Status     = "todo" | "in_progress" | "done" | "blocked";
type Weekday    = "Mon" | ... | "Sun";
type Recurrence = "none" | "daily" | Weekday[];
type Task = {
  id; title; helperId; time; status; station;
  recurrence?; photo?; blockedReason?; suggested?;
  suggestedBy?; queuedForShift?; emergency?; afterHours?;
  rescheduleNotice?; ...
};
type Routine     = Omit<Task, "status"> + template metadata;
type Appointment = { id; title; date; time; ... };
type ShiftSegment = { start: "HH:MM"; end: "HH:MM" };
type DaySchedule  = { rest; segments: ShiftSegment[]; breakStart?; breakEnd? };
type WeekSchedule = Record<Weekday, DaySchedule>;
```

### Ledger (time / pay reconciliation)

```ts
type LedgerResolution = "rest" | "premium";
type LedgerReason     = "available" | "override" | "emergency" | "rest_day" | "rest_break";
type LedgerEntry      = { id; helperId; minutes; reason; resolution; adjustMinutes; ... };
type ValeStatus  = "pending" | "approved" | "declined";
type ValeRequest = { id; helperId; amount; reason; status };
```

### Household state

```ts
type PantryItem  = { id; name; category: PantryCategory; qty; unit; par };
type GroceryItem = { id; name; qty; unit; added; bought };
type QuickUtos   = { id; content; from; to; ack?: "seen" | "done"; afterHours?; waiting?; ... };
type RosaStatus  = { status: "on_shift" | "available" | "off"; until; quiet; restDay };
type MyNote      = { id; text; done; voice?; createdAt };   // helper's private notepad
```

### Onboarding / portability

```ts
type Employment = "live-in" | "live-out";
type InviteFlag = { id; field; note?; at };
type Invite = {
  id;
  code; // e.g. "LINARA-7429"
  name;
  station;
  employment;
  shiftHours;
  restDay;
  wage;
  contact;
  status: "pending" | "active";
  claimedName?;
  flags: InviteFlag[];
  createdAt;
  createdBy;
};
```

### Cross-cutting context

- `GroceryCtx` (React `createContext`) shares the grocery list between manager and helper views.
- Constants: `QUIET_START_HOUR=22`, `QUIET_END_HOUR=6`, `MON_FRI`, `INITIAL_*` seed data for helpers, admins, schedules, tasks, appointments, pantry, and prep tasks derived from event templates.

---

## 5. Component Architecture

The single-file app is organized as one root state container plus role-scoped views and reusable UI blocks. Approximate structure:

```
<Route />
└── <LinaraApp/>                       ← owns ALL state; wires callbacks
    ├── <TopBar/>                      ← persona switcher, sim clock, EOD toggle
    │   ├── <EndOfDayToggle/>
    │   └── <ViewAsSwitcher/>
    ├── <ManagerView/>                 ← Ben / Tina / Lola Fe (remote)
    │   ├── <NeedsYou/>                ← blocked tasks, pending vales, invite flags
    │   ├── <TheBoardStatusLists/>     ← today's live board + lanes
    │   │   └── <HelperLane/> / <BoardTaskCard/> / <NowMarker/>
    │   ├── <RoutinesView/> + <NewRoutineModal/>
    │   ├── Appointments + <EventTemplate> preps
    │   ├── <ShiftsSection/> + <DayEditor/>    ← hidden for remote admin
    │   ├── <PeopleSection/>
    │   │   ├── <InviteHelperModal/>
    │   │   └── <InviteCodeScreen/>
    │   ├── Pantry + Grocery
    │   ├── Ledger / Vale approvals
    │   └── <QuickUtosLauncher/> + <QuickUtosFeed/>
    ├── <HelperView/>                  ← Ate Rosa
    │   ├── Claim entry → <ClaimAccountFlow/> → <ClaimedWelcome/>
    │   ├── <NextTaskCard/> + <BlockReasonModal/>
    │   ├── <MyWeekCard/>              ← read-only week view
    │   ├── <MyTerms/>                 ← "record is yours" transparency card
    │   ├── <PayRecord/> + <ValeRequestModal/>
    │   ├── My Notes (voice + text scratchpad → optional task promotion)
    │   ├── <QuickUtosFeed/>           ← availability-aware, no daily count
    │   └── <EndOfDay/>
    └── <BottomNav/>
```

### Role capabilities (front-end gating only)

| Capability                               | Primary | Co-manager |  Remote (OFW)   |   Helper   |
| ---------------------------------------- | :-----: | :--------: | :-------------: | :--------: |
| Approve tasks onto the board             |    ✔    |     ✔      | (via Send-live) |     —      |
| Send task suggestion                     |    ✔    |     ✔      |   ✔ (default)   |     —      |
| Edit shifts / off-hours override         |    ✔    |     ✔      |    ✖ hidden     |     —      |
| Invite a helper                          |    ✔    |     ✔      |        ✖        |     —      |
| Approve / decline vale                   |    ✔    |     ✔      |        ✔        |     —      |
| See Done photos / ledger / board glance  |    ✔    |     ✔      | ✔ (emphasized)  | own record |
| Claim account, flag terms, private notes |    —    |     —      |        —        |     ✔      |

### Design conventions

- Brand tokens applied via inline hex + Tailwind utility classes (no ad-hoc `text-white` / arbitrary purples).
- All modals are Radix Dialogs from `src/components/ui/dialog.tsx`.
- Icons from `lucide-react`.
- Time is simulated: `LinaraApp` holds a `simOffsetMs` so the whole UI can be pushed to any hour to demo quiet-hours / after-shift behavior.

---

## 6. Execution Model & Behaviour Rules

### State ownership

`LinaraApp` (in `src/routes/index.tsx`, ~L454+) is the single source of truth. Every mutation is a callback passed down. Notable state slices:

- `tasks`, `routines`, `appointments`, `pantry`, `grocery`, `ledger`, `vales`, `utosList`, `schedules`, `invites`, `admins`, `boardClosed`, `simOffsetMs`, `rosaStatus`, `viewAs`.

### Task lifecycle

1. Primary/Co-manager `onAdd` → task lands on the board (`status: "todo"`).
2. Remote admin `onAdd` → task is `suggested: true, suggestedBy: "Lola Fe"`; shows in the on-site manager's Pass as _"Suggested by Lola Fe"_. Manager `onApproveSuggestion` promotes it; `onDismissSuggestion` drops it. Optional **Send live** flag from the remote admin bypasses the queue for genuine urgencies (still attributed).
3. Helper flips `todo → in_progress → done`; Done can carry a photo. `onBlock` sets `blocked` with a reason and surfaces in `NeedsYou`.
4. Recurring tasks respect `Recurrence` (`daily` / weekday set) and reseed at start-of-day.

### Reachability (quiet hours & rest days)

- Quick utos and non-emergency tasks respect `QUIET_START_HOUR`/`QUIET_END_HOUR` and per-day `rest` flag.
- Off-hours items land as **"waiting when off"** for the helper; nightly clear wipes the utos feed at start-of-day (`onStartNewDay`).
- **Note:** the daily quick-utos tally/count UI was removed on both sides per product direction; sending, receiving, "Got it/Done", availability-aware waiting, and nightly clear all remain.

### Ledger

- Off-shift work, emergencies, rest-day work, and skipped rest breaks create `LedgerEntry` rows. Household default (`ledgerDefault`) resolves to time-off (`rest`) or premium pay (`premium`); either party can override per entry via `onUpdateLedgerEntry`.

### Vale (cash-advance) flow

- Helper submits via `ValeRequestModal`. Managers (including remote admin) approve/decline in `NeedsYou`. Approved vales appear in `PayRecord`.

### Invite → Claim → Portability

1. Manager `InviteHelperModal` records name/role/shift/wage/contact → generates `LINARA-XXXX` code. Row appears in People as **Invited — pending**.
2. Helper enters code in `ClaimAccountFlow`: (a) match code, (b) review terms (`MyTerms` reused later as always-on transparency), (c) set own name + PIN (mock), (d) land in Today.
3. On claim, invite `status` flips to `"active"`; People list shows helper as **Active**.
4. If she taps _"Something's not right?"_ during review, an `InviteFlag` is recorded and surfaces in the manager's `NeedsYou` with a **Mark resolved** action.
5. `PayRecord` shows the calm "This record is yours" portability note.

### Helper's private notes

- One-line text input, "🎙️ Hold to record" mock voice note → `MyNote`.
- Each note can be marked done/deleted, or **Add to board** to open the task form prefilled with the note text. This is the only crossover; notes stay private otherwise.

### Simulated time & end-of-day

- `simOffsetMs` shifts the wall clock. `boardClosed` + `onStartNewDay` resets utos, reseeds daily routines/appointments, and closes the day cleanly.

---

## 7. Planned Execution / Next Steps

The prototype is deliberately state-only. A realistic path to production:

1. **Extract features.** Split `src/routes/index.tsx` into `src/features/{board,people,shifts,ledger,pantry,utos,notes,invites}/` with typed hooks and colocated components.
2. **Persist state.** Add a database (Postgres/Supabase or equivalent). Model tables mirror Section 4 types (`tasks`, `routines`, `appointments`, `helpers`, `admins`, `schedules`, `pantry_items`, `grocery_items`, `vales`, `ledger_entries`, `invites`, `invite_flags`, `quick_utos`, `notes`). Follow the project's user-roles pattern (separate `user_roles` table + `has_role` SECURITY DEFINER; never store roles on profiles). Always pair `CREATE TABLE public.*` with explicit `GRANT`s and RLS policies.
3. **Server functions.** Move mutations to `createServerFn` in `src/lib/*.functions.ts`, behind an auth middleware. Public webhooks (e.g. SMS invite) go under `src/routes/api/public/*` with signature verification.
4. **Real-time.** Use realtime channels (e.g. Supabase realtime or a websocket route) for `tasks`, `utos`, and `ledger` so manager and helper devices stay in sync without polling.
5. **Auth.** A managed auth provider. Invite codes redeem into a real account owned by the helper (matching the "record stays yours" copy).
6. **Media.** Move Done photos and voice notes to object storage; keep `photo` fields as URLs.
7. **Reporting.** Introduce TanStack Query per the canonical loader/component pattern already wired in `router.tsx` (loader `ensureQueryData` + component `useSuspenseQuery`).
8. **SEO/PWA polish.** Route-level `head()` for each shareable page (currently only `/` exists); add manifest + install prompt for helper phones.
9. **Testing.** Add Vitest + Playwright smoke flows for the invite→claim→board→ledger loop.

---

## 8. Development Notes

- Dev server: `bun dev` → http://localhost:8080. HMR is on.
- Build: `bun run build` → `.output/server/index.mjs` + `.output/public/`. Dev build: `bun run build:dev`. Preview: `bun run preview`.
- Checks: `bun run lint`, `bun run typecheck`, `bun run format:check`. Prettier is enforced through ESLint, so `bun run format` is usually what fixes a failing lint.
- Never edit `src/routeTree.gen.ts`; the router plugin regenerates it from `src/routes/`.
- Never bypass shadcn tokens with hardcoded colors in components — brand hexes are applied inline only inside the prototype `index.tsx` for speed and will migrate to `@theme` tokens in `styles.css` during extraction.

---

## 9. Server / Client Boundary & Environment

### Boundary

- Everything under `src/routes/` and `src/components/` is rendered on the server for the
  initial HTML and then hydrated in the browser — treat it as client code.
- Server-only modules are `src/server.ts` (SSR entry), `src/start.ts` (request middleware),
  and anything created later with `createServerFn` or named `*.server.ts`. ESLint blocks the
  Next.js `server-only` package to keep that convention explicit.
- The app makes no network calls today, so there is no data-fetching boundary to defend yet;
  `QueryClient` is created per request in `getRouter()` (`src/router.tsx`), which is the
  SSR-safe pattern — never hoist it to a module-level singleton.

### Environment variables

- None are read today. `.env.example` documents the convention and is the only env file in
  version control.
- `VITE_*` variables are inlined into the browser bundle — public by definition.
- Unprefixed variables stay in the server bundle; use them for anything secret.

### Build & deployment flow

1. `bun run build` runs the Vite client build, then the SSR build, then Nitro bundles both
   into `.output/` (`server/index.mjs` + `public/`).
2. `node .output/server/index.mjs` (or `bun`) serves it; `PORT` selects the port.
3. `bun run preview` serves the same build locally through Vite on port 8080.
4. Platform targets (Cloudflare, Vercel, Netlify, …) are a Nitro preset choice — set
   `NITRO_PRESET` or pass options to `nitro()` in `vite.config.ts`. Nothing platform-specific
   is committed.
