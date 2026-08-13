# Linara Home — System Architecture & Technical Blueprint

This document defines the complete technical architecture, API design, database schema, and data flow patterns for **Linara** (app) / **Linara Home** (product & entity). It transitions the single-file front-end prototype in [`src/routes/index.tsx`](src/routes/index.tsx) into a multi-user, real-time, production-ready system backed by Supabase and TanStack Start.

The specifications in this file are strictly derived from [`plan.md`](plan.md), which serves as the single source of truth for features and behaviors.

---

## 1. System Overview

### 1.1 High-Level Concept

Linara serves as a kitchen-style operating system for domestic households in the Philippines. It models household tasks as "tickets" associated with specific "stations" (Yaya, Cook, Laundry, Driver, House), where every ticket carries a designated "House Standard" (SOP).

The platform supports two-sided transparency:

- **The Manager's Pass:** A read-mostly executive dashboard for on-site and remote OFW (Overseas Filipino Worker) family managers to monitor the home's pulse, coordinate schedules, and manage budgets/pay.
- **The Worker's Station:** A focused, high-contrast, task-oriented mobile interface for the helper, displaying a predictable weekly schedule, active ticket execution, private scratchpad notes, and portable financial records (vales, base wage, and accrued rest-owed hours) to ensure dignity by design.

### 1.2 Tech Stack

#### Client Runtime & Framework

- **Frontend SPA / SSR Shell:** React 19 inside TanStack Start v1 (powered by Vite 8).
- **Client Routing:** TanStack Router v1 (typed file-based routes generated under `src/routes/` and compiled in `src/routeTree.gen.ts`).
- **State & Cache Management:** TanStack Query v5 configured in [`src/router.tsx`](src/router.tsx) and shared via React context.
- **TypeScript:** TypeScript 5.8 in `strict` mode with path alias `@/*` pointing to `src/*`.

#### Styling & Design Tokens

- **Styling Engine:** Tailwind CSS v4 via `@tailwindcss/vite` (native `@import` and `@theme` variables declared in [`src/styles.css`](src/styles.css), no legacy `tailwind.config.js`).
- **UI Components:** shadcn/ui (Radix UI primitives) located under `src/components/ui/`.
- **Utilities:** `tw-animate-css`, `class-variance-authority`, `clsx`, and `tailwind-merge` for variant composition and classes merging.
- **Icons:** Lucide React icons via the `lucide-react` package.
- **Typography:** Fraunces (serif headings) + Nunito Sans (humanist sans body), loaded via `<link>` tags in the [`src/routes/__root.tsx`](src/routes/__root.tsx) head element.
- **Brand Tokens:**
  - Pine-teal: `#1F5A54` (Primary brand color)
  - Sand: `#F7F3EC` (App body background)
  - Card Cream: `#FDFBF6` (High-contrast card background)
  - Terracotta-gold: `#D99A6C` (Accent / Action color)

#### Backend Runtime & Services

- **Backend Server Worker:** Nitro v3 (`nitro/vite`) building the deployable server into `.output/` using portable Node/Bun runtime presets.
- **API & Server Functions:** `@tanstack/react-start` server functions (`createServerFn`) and server routes configured under `src/routes/api/`.
- **Core Server Wrapper:** [`src/server.ts`](src/server.ts) wraps the Start SSR entry, catching rendering failures and transforming them into readable, structured HTML error pages rather than generic h3 JSON 500 payloads.
- **Data & Auth Provider:** Supabase local development engine and production cloud services.
  - _Database:_ PostgreSQL instance with strict schema constraints.
  - _Security:_ Row-Level Security (RLS) policies isolating tenants.
  - _Real-time Synchronization:_ PostgreSQL Realtime channels.
  - _Authentication:_ GoTrue Gateway managing session tokens (JWTs) and user registrations.
  - _Object Storage:_ Supabase Storage buckets (S3 compatible) for photo evidence and voice memos.

#### Tooling

- **Package Manager:** Bun (`bunfig.toml`, `bun.lock`).
- **Code Quality:** ESLint 9 flat configuration paired with Prettier formatting.
- **Dev Server:** Vite 8 listening on port 8080.

---

## 2. Textual Architecture Diagram

The system follows an N-Tier architecture pattern, routing state mutations from client devices through a secure serverless API layer into highly segmented transactional datastores.

### 2.1 System Components and Data Routing

```
       ┌────────────────────────────────────────────────────────┐
       │                     CLIENT TIER                        │
       │                                                        │
       │   ┌────────────────────────┐  ┌────────────────────┐   │
       │   │  Manager's Pass (Web)  │  │ Helper's Mobile St │   │
       │   └───────────┬────────────┘  └─────────┬──────────┘   │
       │               │                         │              │
       │               └────────────┬────────────┘              │
       │                            ▼                           │
       │       State Controller (TanStack Query Cache)          │
       │       Local Scratchpad Cache (LocalStorage/IndexedDB)  │
       └────────────────────────────┬───────────────────────────┘
                                    │
                                    │ HTTPS (API Route Calls) / WSS (Realtime Broadcasts)
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │                     SERVICES TIER                      │
       │                                                        │
       │   ┌────────────────────────┐  ┌────────────────────┐   │
       │   │  Nitro Server Worker   │  │  Supabase Auth /   │   │
       │   │  (TanStack Server Fn)  │  │  GoTrue Gateway    │   │
       │   └───────────┬────────────┘  └─────────┬──────────┘   │
       │               │                         │              │
       │               └────────────┬────────────┘              │
       │                            ▼                           │
       │      Business Logic Engine (Batas Kasambahay Core)     │
       └────────────────────────────┬───────────────────────────┘
                                    │
                                    │ Transaction SQL Query / Signed Storage Post
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │                   DATA & STORAGE TIER                  │
       │                                                        │
       │   ┌────────────────────────┐  ┌────────────────────┐   │
       │   │  PostgreSQL Database   │  │ Supabase S3 bucket │   │
       │   │   (RLS Partitioning)   │  │ (Receipts/Photos)  │   │
       │   └────────────────────────┘  └────────────────────┘   │
       └────────────────────────────────────────────────────────┘
```

### 2.2 Project Codebase Structure

The file structure and modules are organized to colocate domain logic within isolated feature directories.

```text
.
├── ARCHITECTURE.md              ← This system architecture specification
├── README.md                    ← Setup, scripts, and deployment instructions
├── plan.md                      ← Product Requirements Document (PRD) — Single Source of Truth
├── package.json                 ← Bun-managed dependencies
├── vite.config.ts               ← Tailwind + Nitro + Start + React plugins configuration
├── tsconfig.json                ← Strict TypeScript configuration with @/* path aliases
├── components.json              ← shadcn/ui design setup file
├── eslint.config.js             ← ESLint 9 configuration
└── src/
    ├── router.tsx               ← getRouter() instantiation (QueryClient + Router creation)
    ├── server.ts                ← Nitro SSR entry wrapper (catches SSR failures safely)
    ├── start.ts                 ← TanStack Start client bootstrapper
    ├── styles.css               ← Tailwind v4 @theme configuration and global variables
    ├── routeTree.gen.ts         ← Auto-generated typed router file — Do not edit
    ├── routes/
    │   ├── README.md            ← Routing conventions cheat-sheet
    │   ├── __root.tsx           ← Root layout, <html> shell, providers, SEO metadata
    │   ├── index.tsx            ← Route `/` — redirects to /manager/pass
    │   ├── _app.tsx             ← Pathless layout route containing app shell & stores
    │   └── _app/                ← Routed pages with folder boundaries
    │       ├── helper.tsx       ← Helper shell layout (Greeting, availability control, claim banner)
    │       ├── manager.tsx      ← Manager shell layout (TopBar, BottomNav)
    │       ├── helper/
    │       │   ├── index.tsx    ← Helper home redirection
    │       │   ├── pantry.tsx   ← Shared pantry view
    │       │   ├── pay.tsx      ← Helper payslips, vales list, and contract terms
    │       │   └── today.tsx    ← Today's task checklist, private notes, quick utos feed
    │       └── manager/
    │           ├── index.tsx    ← Manager home redirection
    │           ├── money.tsx    ← Ledger accruals, vales approval, and budgets
    │           ├── pantry.tsx   ← Shared pantry inventory & shopping list manager
    │           ├── pass.tsx     ← Pulse indicator, The Line vertical view, or Kanban Board
    │           ├── people.tsx   ← Admins, helper invite generator & claimed terms audit
    │           └── schedule.tsx ← Shift routines, fixed events, and Quick Utos launcher
    ├── features/                ← Domain-driven feature directories (downhill dependencies only)
    │   ├── appointments/        ← Fixed events + backward-computed preparation routines
    │   ├── availability/        ← Shift tracking, quiet-hours gating, send gates
    │   ├── dashboard/           ← Shared application stores, sim-clock, manager/helper wrappers
    │   ├── groceries/           ← Shopping list, receipt slots, spend tracking context
    │   ├── ledger/              ← After-hours ledger, REST-owed accrual calculations, vales
    │   ├── notes/               ← Helper private notepad (scratchpad)
    │   ├── pantry/              ← Stock level tracker and PAR values
    │   ├── people/              ← Household membership & invite handshake APIs
    │   ├── shifts/              ← Shift schedules and calendar day-editors
    │   ├── tasks/               ← Routines, Kanban boards, and SOP standards cards
    │   └── utos/                ← Ephemeral short-order quick asks
    ├── components/
    │   ├── shared/              ← Shared custom UI elements (avatar, field, bottom-nav)
    │   └── ui/                  ← shadcn UI Radix components (dialog, cards, inputs)
    ├── hooks/
    │   ├── use-mobile.tsx       ← Layout breakpoint utilities
    │   └── use-mounted.ts       ← Hydration shield for clock and status elements
    └── lib/
        ├── utils.ts             ← Standard cn() layout composition utility
        ├── time.ts              ← Weekday parsers, offset generators, shift overlaps
        ├── error-capture.ts     ← SSR error listener
        └── error-page.ts        ← Error fallback page template
```

### 2.3 Feature Folder Design Conventions

To maintain structural order and clean boundaries, dependencies are unidirectional:

```
Routes (Pages) ──► Views ──► Feature Hooks ──► Feature Constants/Types/Utils ──► Shared Library (src/lib)
```

Cross-feature imports are allowed strictly downstream (e.g., a component under `features/tasks/` may import types from `features/shifts/`; but a utility file under `features/shifts/` must never import a component from `features/tasks/`). No barrel files (`index.ts`) are used; all imports explicitly name the module files they extract from to preserve tree-shaking efficiency.

---

## 3. Frontend Architecture

### 3.1 Component Hierarchy & Role Isolation

The client UI mounts pathless route wrappers under [`src/routes/_app.tsx`](src/routes/_app.tsx) to instantiate state providers without tearing them down during page navigations.

```
<__root> (HTML & Query Context Shell)
└── <AppStoreProvider> (Global context providing all domain-level feature stores)
    └── <AppShell> (Simulated clock simulator offsets and state)
        ├── <TopBar> (Persona switcher, Simulated Clock controller, EOD toggler)
        │
        ├── <ManagerView> (Routed under /manager)
        │   ├── <PulseHeader> (Completed ticket counts, Needs You actionable alerts)
        │   ├── <NeedsYouList> (Approve Remote Suggestions, Resolve Ticket Blocks, Vale approvals, Onboarding flags)
        │   ├── <TheBoardStatusLists> (Active board rendering)
        │   │   ├── <TheLineView> (Lanes grouped vertically by Helper/Station)
        │   │   └── <TheBoardView> (Lanes grouped horizontally by Kanban status: Todo, Doing, Done)
        │   │       └── <BoardTaskCard> (Contextual action buttons, "Done" evidence viewer)
        │   ├── <CalendarSection> (Monthly overview, Appointment creator)
        │   │   └── <EventRecipeSelector> (Preset templates: "Airport departure", "Typhoon Prep")
        │   ├── <PantrySection> (Pantry item counters, Low-stock indicators)
        │   ├── <MoneySection> (Spend tracking, Base wage accrual ledger, Vale ledger)
        │   └── <QuickUtosLauncher> (Compact quick text/chip trigger)
        │
        └── <HelperView> (Routed under /helper)
            ├── <ClaimAccountFlow> (Invite Code lookup, Terms audit screen, Password creation lock)
            ├── <DignityHeader> (Greeting, Shift-end countdown, Rest-day visual tracker)
            ├── <NextTaskCard> (Single-focus card showing Active task, interactive SOP slides, and Start/Finish actions)
            ├── <QuickUtosFeed> (Floating alert-chips for immediate action items, "Got it/Done" button trigger)
            ├── <PrivateNotesScratchpad> (Helper private text list + offline voice recorder with 'Promote to Board' trigger)
            └── <PayRecordView> (Accrued wages, Current Rest-owed hour counts, SSS/Philhealth/Pag-IBIG compliance logs)
```

### 3.2 State Management & Client-Side Cache

The client utilizes three structured layers of state management to maintain native-speed transitions:

1.  **TanStack Query Cache:** Caches read operations from transactional database tables (`tickets`, `pantry_items`, `ledger_entries`). Handled via loaders configured inside [`src/router.tsx`](src/router.tsx) utilizing `.ensureQueryData()` and `.useSuspenseQuery()` hooks.
2.  **`GroceryCtx` (React Context):** Shared local context that synchronizes the active grocery checklist between the Pantry tab (manager side) and the focused Palengke Run task card (helper side).
3.  **Local Sync Queue (IndexedDB):** Stores completed tickets, offline scratchpad notes, and local photo captures when network state is offline (`navigator.onLine === false`). A service worker processes the sync queue automatically once online status transitions back.

### 3.3 State Ownership: Feature Stores Mapping

State is kept in specific domain hooks created at the `_app` composition root:

| Store Hook                     | State Responsibility                                                                                |
| :----------------------------- | :-------------------------------------------------------------------------------------------------- |
| `useSession`                   | Holds `admins` registry, `currentAdminId`, and computed `adminType` roles.                          |
| `useTaskBoard`                 | Manages `tasks`, `routines`, `boardClosed` end-of-day flags, and `startNewDay` re-seeding triggers. |
| `useAppointments`              | Manages fixed calendar events and triggers backward prep-task computation on the board.             |
| `useSchedules`                 | Manages helper weekly shift boundaries (`shiftStart`, `shiftEnd`, `weeklyRestDay`).                 |
| `useAvailability`              | Calculates active helper status (`on_shift`, `available`, `off`) and manual override opt-ins.       |
| `useSendGate`                  | Operates the friction modal blocker whenever an Off-shift helper is pinged.                         |
| `useLedger` / `useVales`       | Accrues overtime/emergency minutes, resolves compensation formats, and processes cash advances.     |
| `useUtos`                      | Coordinates momentary quick-ask signals and midnight database sweep triggers.                       |
| `usePantry` / `useGroceryList` | Monitors pantry item PAR indicators and manages grocery budgets/receipt attachments.                |
| `useMyNotes`                   | Houses private scratchpad entries with mock voice notes and board-promotion templates.              |
| `useSimClock`                  | Propagates the simulated time offset across the entire application interface.                       |

### 3.4 Role Gating & Operational Capabilities

Frontend interfaces block actions based on active user scopes:

| Capability                          | Primary Manager | Co-Manager |    Remote Admin (OFW)     |    Helper (Station)    |
| :---------------------------------- | :-------------: | :--------: | :-----------------------: | :--------------------: |
| **Approve Suggested Tasks**         |   Yes (Live)    | Yes (Live) | No (Creates Suggestions)  |           No           |
| **Direct Override / Send-Live**     |       Yes       |    Yes     | Yes (Bypasses Suggestion) |           No           |
| **Modify Shift Limits & Calendars** |       Yes       |    Yes     |        No (Hidden)        |           No           |
| **Generate Helper Invites**         |       Yes       |    Yes     |            No             |           No           |
| **Approve Vales & Cash Requests**   |       Yes       |    Yes     |   Yes (Provides Funds)    |           No           |
| **Review Receipts & Evidence URLS** |       Yes       |    Yes     |     Yes (Focus Area)      | Yes (Own records only) |
| **Claim Accounts & Write Notes**    |       No        |     No     |            No             |          Yes           |

---

## 4. Backend Architecture

Type-safe backend API operations are handled via TanStack Start server functions executed within Nitro worker nodes, keeping business rules securely on the server.

### 4.1 Separation of Concerns

```
  ┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
  │      Route Loader      │      │    Server Function     │      │   Data Access Layer    │
  │                        │      │                        │      │                        │
  │ Pre-fetches database   │ ───► │ Enforces Auth, Checks  │ ───► │ Executes transactional │
  │ tables to populate the │      │ regional labor rules,  │      │ SQL queries, returns   │
  │ TanStack Query Cache.  │      │ executes mutations.    │      │ normalized types.      │
  │ (Ensures zero hydration│      │ (Validates constraints │      │ (Protects references,  │
  │ flickers on device).   │      │ before writing).       │      │ handles DB locks).     │
  └────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

### 4.2 Security Boundaries & Multi-Tenant Isolation

Strict data segmentation is enforced at the database layer via PostgreSQL Row-Level Security (RLS) rules and server middleware.

- **Household Segregation:** Users are assigned a `household_id` UUID during enrollment. General tables (`tickets`, `schedules`, `pantry_items`, `vales`) store a `household_id` foreign key. The primary RLS policy ensures users can only query rows matching their own session's `household_id`.
- **Helper Note Isolation:** To protect helper privacy, the `helper_notes` table maintains a "Privacy Wall." RLS policies block anyone from reading, inserting, or modifying these notes unless their authenticated PostgreSQL UUID matches the note's `helper_id`. Managers cannot bypass this database constraint.
- **Server/Client Boundary Security:** Webhook handlers (e.g., automated third-party integrations) live in public api endpoints under `src/routes/api/public/*` and require verification of SHA256 cryptographic signatures. Core endpoints require the `requireSupabaseAuth` middleware.

---

## 5. External Integration Designs

### 5.1 Supabase Object Storage Media Pipe

- **Evidence Uploads:** Client devices compress task-completion images client-side (to a maximum width of 1200px) to minimize data costs. Uploads are posted directly to the `household-evidence` storage bucket via signed headers generated by a server function.
- **File Restrictions:** Bucket policies enforce MIME types: `image/jpeg`, `image/png`, and `audio/webm` (for helper voice memos). File sizes are capped at 10MB.
- **Media Security:** Bucket objects are private. The application requests temporary pre-signed URLs with a strict 15-minute expiration:
  ```typescript
  const { data } = await supabase.storage
    .from("household-evidence")
    .createSignedUrl("receipts/rec_0182.jpg", 900);
  ```

### 5.2 Batas Kasambahay Compliance Engine

The backend implements labor guidelines based on Republic Act No. 10361 (Batas Kasambahay):

- **Minimum Wage Audit:** Validates registered wages against regional limits (e.g., NCR: ₱6,000/mo) stored in a static database lookup table. Inserts warning flags if an invitation's base rate is below legal requirements.
- **Statutory Contribution Matrix:** Automates SSS, PhilHealth, and Pag-IBIG monthly calculations:
  - _If base wage < ₱5,000:_ The employer covers 100% of the statutory contributions (per RA 10361).
  - _If base wage >= ₱5,000:_ The cost is split according to national government contribution tables.
- **Rest Premium Compensation:** Automatically calculates after-hours work and rest day overrides, logging the overtime minutes to the ledger. Out-of-hours tasks accrue time-off in lieu ("Rest Owed") or premium pay calculated at a standard 1.3x multiplier of the helper's hourly rate equivalent.

### 5.3 Fintech Outbound Payment Pipeline (Future Phase 3 Setup)

Establishes the data structures and ledger webhook points required to supportGCash and Maya mobile wallet integration:

- Finalized payroll details and approved vale requests compile in the `PayRecordView` component.
- A webhook payload model is prepared to transmit transaction records to partner payout aggregators (e.g., Brankas or PayMongo), mapping payouts directly to the ledger:
  ```json
  {
    "payout_id": "po_99182",
    "recipient_wallet": "+639171234567",
    "payout_amount": 4250.0,
    "payout_currency": "PHP",
    "reference_ledger_entry_id": "le_0182-ab"
  }
  ```

---

## 6. Step-by-Step Data Flow

### 6.1 Helper Invitation & Handshake Flow

```
[Primary Manager]                 [Backend API]                    [Database / SMS]
        │                                │                                │
        ├─► POST /api/helpers/invite ───►│                                │
        │   (Terms & schedule details)   ├─► Validate Wage & Rest day     │
        │                                ├─► Generate inviteCode, insert  │
        │                                │   row into helper_profiles     │
        │                                └─► Send Invite SMS (Optional) ─► [Helper Mobile]
        │                                                                         │
[Helper Device]                                                                   │
        │                                                                         │
        ├─► Receives SMS with Code "LN98A2" ◄─────────────────────────────────────┘
        │
        ├─► Enters Code "LN98A2"
        ├─► GET /api/helpers/claim/verify ───────────────────────────────┐
        │   ◄────────────────── Return un-claimed terms ─────────────────┘
        │
        ├─► Reviews Wage: ₱8,000/mo, Rest Day: Sunday (Accepts)
        ├─► POST /api/helpers/claim (Sets Password) ─────────────────────┐
        │                                                                ├─► Creates Auth User
        │                                                                ├─► Sets Profile Active
        │   ◄────────────────── Returns Session JWT ─────────────────────┘
        ▼
   (Helper Enters Station)
```

### 6.2 Anchor-Based Rescheduling Flow

```
[Manager Device]                  [Backend API]                    [Database]
        │                                │                                │
        ├─► PATCH /api/appointments/:id ─►│                                │
        │   (Time shifts 6am -> 9am)     ├─► Update appointment row       │
        │                                ├─► Query dependent tasks (lead) │
        │                                ├─► Update each task start/end   │
        │                                ├─► Insert notification rows     │
        │                                └─► Broadcast change event ─────►[Helper Device]
        │                                                                      │
        │                                ◄── Realtime push (Websocket) ────────┘
        ▼                                ▼
 (Pass displays shifted)          (Station flashes Alert:
                                   "Flight moved to 9am.
                                   Fold clothes shifted.")
```

### 6.3 Quick Utos Dispatch & Midnight Purge

```
[Manager Device]                  [Backend API]                    [Database]
        │                                │                                │
        ├─► POST /api/utos/send ────────►│                                │
        │   (Content: "+ Rice",          ├─► Check Helper Reachability    │
        │    Recipient: Rosa)            ├─► Insert utos row              │
        │                                └─► Broadcast event ────────────►[Helper Device]
        │                                                                      │
        │                                                                      ├─► Displays floating chip
        │                                                                      ├─► Helper taps "Got It"
        │                                ◄── Send ACK status ──────────────────┘
        │                                │
        ├─► Received Realtime Update ◄───┤
        ▼                                ▼
 (Pass updates: Done)             (Chip vanishes from Station)
                                         │
                                         ▼ (System Midnight Cron)
                                  DELETE FROM quick_utos WHERE created_at < NOW()
```

---

## 7. API Design

### 7.1 Helper Account Management

_Note: To ensure complete compile-time type safety across the frontend and server environments, these handshakes are implemented as **TanStack Start Server Functions** (`createServerFn`) located under [`src/features/people/people.actions.ts`](src/features/people/people.actions.ts). They are directly invocable by clients with zero HTTP configuration or hydration bottlenecks, though they compile down to secure server RPC nodes._

#### `POST /api/helpers/invite` (Invocable via `inviteHelperFn`)

Creates a pending helper slot and returns a 6-character alphanumeric invitation code.

- **Auth Level:** Primary Manager or Co-Manager JWT (`Authorization: Bearer <JWT>`).
- **Request Body:**
  ```json
  {
    "name": "Maria Rosa",
    "station": "Cook",
    "monthlyRate": 8000.0,
    "paydayInterval": "semi_monthly",
    "shiftStart": "06:00:00",
    "shiftEnd": "18:00:00",
    "dailyBreakDuration": 120,
    "weeklyRestDay": 0,
    "contactPhone": "+639171112222"
  }
  ```
- **Response Codes:** `201 Created`, `400 Bad Request`, `401 Unauthorized`.
- **Response Body:**
  ```json
  {
    "helperId": "hp_981273",
    "inviteCode": "LN98A2",
    "inviteUrl": "https://linara.ph/claim?code=LN98A2",
    "status": "PENDING_CLAIM"
  }
  ```

#### `GET /api/helpers/claim/verify`

Fetches the designated employment terms for an invite code prior to registration.

- **Auth Level:** Unauthenticated.
- **Query Parameters:** `code=LN98A2`
- **Response Codes:** `200 OK`, `404 Not Found`.
- **Response Body:**
  ```json
  {
    "inviteCode": "LN98A2",
    "name": "Maria Rosa",
    "station": "Cook",
    "monthlyRate": 8000.0,
    "shiftStart": "06:00:00",
    "shiftEnd": "18:00:00",
    "weeklyRestDay": 0
  }
  ```

#### `POST /api/helpers/claim/flag`

Flags a mismatch in invitation terms prior to claiming, suspending the handshake process.

- **Auth Level:** Unauthenticated.
- **Request Body:**
  ```json
  {
    "inviteCode": "LN98A2",
    "field": "wage",
    "note": "We agreed on ₱8,500 monthly rate, not ₱8,000."
  }
  ```
- **Response Codes:** `200 OK`, `400 Bad Request`, `404 Not Found`.
- **Response Body:**
  ```json
  {
    "flagId": "flg_19283a",
    "status": "SUSPENDED"
  }
  ```

#### `POST /api/helpers/claim`

Claims the invitation code, registers the helper profile, and returns an access token.

- **Auth Level:** Unauthenticated.
- **Request Body:**
  ```json
  {
    "inviteCode": "LN98A2",
    "email": "rosa.maria@gmail.com",
    "password": "securepassword123"
  }
  ```
- **Response Codes:** `200 OK`, `400 Invalid Code`, `409 Email Conflict`.
- **Response Body:**
  ```json
  {
    "accessToken": "jwt_token_here",
    "refreshToken": "refresh_token_here",
    "userId": "usr_991823",
    "helperId": "hp_981273"
  }
  ```

### 7.2 Ticket Operations

#### `PATCH /api/tickets/:id/status`

Updates the operational status of a ticket.

- **Auth Level:** Assigned Helper or Manager JWT.
- **Request Body:**
  ```json
  {
    "status": "in_progress",
    "timestamp": "2026-07-24T18:05:00Z"
  }
  ```
- **Response Codes:** `200 OK`, `403 Forbidden`, `404 Not Found`.
- **Response Body:**
  ```json
  {
    "ticketId": "tk_55021",
    "status": "in_progress",
    "activeSince": "2026-07-24T18:05:00Z"
  }
  ```

#### `POST /api/tickets/:id/complete`

Submits photo evidence to finalize a ticket and calculate any rest-owed overrides.

- **Auth Level:** Assigned Helper JWT.
- **Content-Type:** `multipart/form-data`
- **Request Payload:**
  - `photo`: Binary image payload (JPG/PNG)
  - `notes`: Optional operational text notes
- **Response Codes:** `200 OK`, `400 File Too Large`, `401 Unauthorized`.
- **Response Body:**
  ```json
  {
    "ticketId": "tk_55021",
    "status": "done",
    "photoEvidenceUrl": "https://storage.linara.ph/evidence/tk_55021_done.jpg",
    "ledgerEntryCreated": false
  }
  ```

### 7.3 Instant Messages & System triggers

#### `POST /api/utos/send`

Dispatches a quick, non-archived task or vocal instruction to a helper.

- **Auth Level:** Admin / Manager JWT.
- **Request Body:**
  ```json
  {
    "recipientId": "hp_981273",
    "content": "+ Rice"
  }
  ```
- **Response Codes:** `201 Created`, `401 Unauthorized`.
- **Response Body:**
  ```json
  {
    "utosId": "ut_00192a",
    "status": "sent",
    "timestamp": "2026-07-24T19:30:00Z",
    "isWaitingOffline": false
  }
  ```

#### `POST /api/utos/:id/ack`

Acknowledges a quick uto, moving its status to seen or done.

- **Auth Level:** Recipient Helper JWT.
- **Request Body:**
  ```json
  {
    "ackState": "done"
  }
  ```
- **Response Body:**
  ```json
  {
    "utosId": "ut_00192a",
    "ackState": "done"
  }
  ```

#### `POST /api/system/purge-utos`

Midnight cron executor that aggregates count metrics and wipes Quick Utos rows.

- **Auth Level:** System Private JWT (`Authorization: Bearer <SYSTEM_CRON_SECRET>`).
- **Response Codes:** `200 OK`, `401 Unauthorized`.
- **Response Body:**
  ```json
  {
    "success": true,
    "rowsPurged": 18,
    "timestamp": "2026-08-01T00:00:00Z"
  }
  ```

---

## 8. Data Structures (Normalized Database Schemas)

This database structure outlines the PostgreSQL relational mappings required to build out the operational platform. All tables are defined inside the `public` schema.

```sql
-- 1. Profiles Table (Holds global users)
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    household_id UUID NOT NULL,
    full_name TEXT NOT NULL,
    user_type TEXT NOT NULL CHECK (user_type IN ('primary_manager', 'co_manager', 'remote_admin', 'helper')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Helper Profiles (Holds terms of employment)
CREATE TABLE public.helper_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    station TEXT NOT NULL CHECK (station IN ('Yaya', 'Cook', 'Laundry', 'Driver', 'House')),
    monthly_rate NUMERIC(10,2) NOT NULL,
    payday_interval TEXT NOT NULL CHECK (payday_interval IN ('semi_monthly', 'monthly')),
    shift_start TIME NOT NULL,
    shift_end TIME NOT NULL,
    daily_break_duration INTEGER NOT NULL DEFAULT 60, -- in minutes
    weekly_rest_day INTEGER NOT NULL CHECK (weekly_rest_day BETWEEN 0 AND 6), -- Sunday = 0, etc.
    break_start TIME, -- one break window per helper, for After-Hours Friction Gating's "on a break" trigger (plan.md)
    break_end TIME,
    invite_code VARCHAR(12) UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('PENDING_CLAIM', 'ACTIVE', 'INACTIVE')) DEFAULT 'PENDING_CLAIM',
    employment TEXT CHECK (employment IN ('live-in', 'live-out')),
    phone TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. House SOP Library
--
-- steps/tools_required/safety_protocol (added by
-- supabase/add-house-sops-columns.sql) hold the structured HouseStandardSOP
-- the generate-sop edge function returns (see KNOWN_GAPS.md Closed Gap C7);
-- src/features/tasks/task.actions.ts's insertHouseSopFn writes them from
-- NewRoutineModal's "Save to Library" action.
CREATE TABLE public.house_sops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    standard_image_url TEXT,
    steps TEXT[] NOT NULL DEFAULT '{}',
    tools_required TEXT[] NOT NULL DEFAULT '{}',
    safety_protocol TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Tickets Table (Operational tasks)
--
-- block_reason/emergency/suggested/queued/queued_for_shift/recurrence/
-- routine_id/appointment_id/appointment_title/lead_minutes/reschedule_notice
-- (added by supabase/add-ticket-board-columns.sql) denormalize what the Pass
-- board UI needs per ticket onto the row itself, closing KNOWN_GAPS.md gap #4
-- (the board was never actually written to). routine_id stays plain TEXT
-- provenance, not a FK -- there is still no `routines` table (Routine
-- templates stay client-local, see use-task-board.ts). appointment_id
-- started the same way (gap #4 landed before `appointments` was written to
-- at all) but was upgraded to a real FK by
-- supabase/add-appointment-atomic-writes.sql once gap #7 closed (Closed Gap
-- C14) -- it's listed here as `public.appointments` (table #5, just below)
-- purely for reading order; the actual ALTER TABLE ran long after both
-- tables already existed live, so the forward reference was never an issue
-- in practice. `station` and `scheduled_date` were deliberately NOT added:
-- station is always derived live from the assigned helper (a column would
-- only reintroduce a staleness bug), and scheduled_date is just the date
-- component of scheduled_start, extracted client-side for appointment-linked
-- tickets only. See src/features/tasks/task.actions.ts and
-- src/features/tasks/hooks/use-task-board.ts for the read/write mapping.
CREATE TABLE public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    title TEXT NOT NULL,
    notes TEXT,
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')) DEFAULT 'todo',
    sop_id UUID REFERENCES public.house_sops(id) ON DELETE SET NULL,
    photo_evidence_url TEXT,
    is_after_hours BOOLEAN NOT NULL DEFAULT FALSE,
    emergency BOOLEAN NOT NULL DEFAULT FALSE,
    suggested BOOLEAN NOT NULL DEFAULT FALSE,
    queued BOOLEAN NOT NULL DEFAULT FALSE,
    queued_for_shift BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason TEXT,
    recurrence TEXT[],
    routine_id TEXT,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    appointment_title TEXT,
    lead_minutes INTEGER,
    reschedule_notice JSONB,
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES public.user_profiles(id)
);

-- 5. Appointments Table (Schedule Anchors)
--
-- Real as of Closed Gap C14 (KNOWN_GAPS.md gap #7) -- previously had columns
-- but no write path at all. supabase/add-appointment-atomic-writes.sql adds
-- three SECURITY DEFINER RPCs (create_appointment_with_preps/
-- reschedule_appointment_with_preps/delete_appointment_with_preps),
-- manager-only, that write this table and its prep `tickets` rows (via
-- appointment_id) together in one transaction. recipe_type now gets written
-- when an appointment is created from one of appointment.constants.ts's
-- EVENT_TEMPLATES (NULL for a manually-built or AI-parsed one). See
-- src/features/appointments/appointment.actions.ts and
-- src/features/appointments/hooks/use-appointments.ts.
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    title TEXT NOT NULL,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    recipe_type TEXT -- Which EVENT_TEMPLATES recipe this was created from, if any
);

-- 6. After-Hours Ledger
--
-- title/kind/adjust_minutes (added by
-- supabase/add-ledger-entry-context-columns.sql) denormalize what the
-- After-Hours Ledger UI displays per entry onto the row itself, rather than
-- joining through associated_ticket_id -- a ledger entry is a historical
-- record and should keep showing the title as it was worked, not drift if a
-- ticket is edited later (this reasoning held even before gap #4 closed and
-- tickets became real -- see KNOWN_GAPS.md Closed Gap C12).
-- duration_minutes holds the auto-computed base duration; adjust_minutes
-- holds a manager's manual adjustment on top of it, matching the client
-- model (see src/features/ledger/hooks/use-ledger.ts).
CREATE TABLE public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('overtime', 'rest_break_work', 'rest_day_work', 'emergency')),
    associated_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task', 'utos')),
    duration_minutes INTEGER NOT NULL,
    adjust_minutes INTEGER NOT NULL DEFAULT 0,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolution_type TEXT CHECK (resolution_type IN ('rest_owed', 'premium_pay')),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Vale Requests (Salary Advances)
CREATE TABLE public.vales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
    approved_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 8. Pantry Inventory Items
CREATE TABLE public.pantry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    qty NUMERIC(6,2) NOT NULL,
    unit TEXT NOT NULL,
    par NUMERIC(6,2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Rice & grains', 'Fresh', 'Baby', 'Cleaning', 'Pantry')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 9. Grocery Checklist Items
--
-- No receipt/photo column here, deliberately (see KNOWN_GAPS.md Closed Gap
-- C13 and gap #2's original note): plan.md 3.2 describes attaching "a
-- picture of the paper receipt" to a Palengke Run, but a receipt naturally
-- covers many grocery_items rows at once, not a single one, so a column here
-- would be the wrong shape. LINARA_MOBILE routes the captured receipt to the
-- Palengke Run ticket's existing `tickets.photo_evidence_url` instead (see
-- ../LINARA_MOBILE/services/api/tickets.ts's getActivePalengkeTicket) and
-- LINARA reads it back the same way (src/features/groceries/hooks/use-grocery-list.ts's
-- `receiptPhoto`, sourced from the board's own tasks, not from this table).
-- The petty-cash budget lives on `households.petty_cash_budget` instead (see
-- above), not here -- it's a household-level setting, not one per row.
CREATE TABLE public.grocery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    qty NUMERIC(6,2) NOT NULL,
    unit TEXT NOT NULL,
    pantry_item_id UUID REFERENCES public.pantry_items(id) ON DELETE SET NULL,
    bought BOOLEAN NOT NULL DEFAULT FALSE,
    actual_cost NUMERIC(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 10. Quick Utos Table (Temporary storage, cleared nightly)
CREATE TABLE public.quick_utos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_name TEXT NOT NULL, -- Display name of admin (e.g., "Sir Ben")
    recipient_id UUID REFERENCES public.helper_profiles(id) NOT NULL,
    content TEXT NOT NULL,
    ack_state TEXT NOT NULL CHECK (ack_state IN ('sent', 'seen', 'done')) DEFAULT 'sent',
    after_hours BOOLEAN NOT NULL DEFAULT FALSE,
    emergency BOOLEAN NOT NULL DEFAULT FALSE,
    waiting BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 11. Helper Private Notes (Protected by strict RLS)
--
-- `voice` is accepted as permanently NULL for voice-originated notes (see
-- KNOWN_GAPS.md Closed Gap C15) -- LINARA_MOBILE's voice pipeline
-- (transcribe-notes/promote-voice-task edge functions) only ever needs the
-- transcript, written to `text` below; the original recording is discarded
-- client-side right after transcription, by design, not as an unfinished
-- upload path.
CREATE TABLE public.helper_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    voice TEXT, -- Unused by design -- see comment above
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 12. Invite Flags Table (Tracks terms mismatch during claiming)
CREATE TABLE public.invite_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_id UUID NOT NULL,
    field TEXT NOT NULL, -- Field flagged (e.g., 'wage', 'shift', 'restDay')
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- --------------------------------------------------
-- INDEXES FOR ENHANCED QUERY PERFORMANCE
-- --------------------------------------------------
CREATE INDEX idx_tickets_household_helper ON public.tickets(household_id, helper_id);
CREATE INDEX idx_helper_profiles_invite ON public.helper_profiles(invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX idx_quick_utos_recipient_created ON public.quick_utos(recipient_id, created_at);
CREATE INDEX idx_user_profiles_household ON public.user_profiles(household_id);

-- --------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_utos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_flags ENABLE ROW LEVEL SECURITY;

-- Recursion-safe household lookup, used by every isolation policy below.
-- A naive `(SELECT household_id FROM public.user_profiles WHERE id = auth.uid())`
-- inline subquery applied ON public.user_profiles' own policy re-triggers
-- that same policy to evaluate the subquery, forever (Postgres error 42P17,
-- "infinite recursion detected in policy"). SECURITY DEFINER runs this
-- function's internal SELECT with RLS bypassed, breaking the cycle. See
-- supabase/fix-household-rls-recursion.sql for the incident this fixed —
-- confirmed live against every table that used the old inline-subquery
-- pattern, discovered while wiring up LINARA_MOBILE's storage RLS.
CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT household_id FROM public.user_profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated, anon;

-- General Tenant (Household) Isolation Policies
CREATE POLICY user_profiles_isolation ON public.user_profiles
    FOR ALL USING (household_id = public.current_household_id());

CREATE POLICY helper_profiles_isolation ON public.helper_profiles
    FOR ALL USING (household_id = public.current_household_id());

CREATE POLICY house_sops_isolation ON public.house_sops
    FOR ALL USING (household_id = public.current_household_id());

CREATE POLICY tickets_isolation ON public.tickets
    FOR ALL USING (household_id = public.current_household_id());

CREATE POLICY appointments_isolation ON public.appointments
    FOR ALL USING (household_id = public.current_household_id());

CREATE POLICY pantry_items_isolation ON public.pantry_items
    FOR ALL USING (household_id = public.current_household_id());

CREATE POLICY grocery_items_isolation ON public.grocery_items
    FOR ALL USING (household_id = public.current_household_id());

-- Helper Private Notes Policy (The Privacy Wall)
-- Prevents any non-owner (including managers) from reading/writing notes
CREATE POLICY helper_notes_privacy ON public.helper_notes
    FOR ALL USING (
        helper_id = (
            SELECT id FROM public.helper_profiles
            WHERE user_id = auth.uid()
        )
    );

-- quick_utos, vales, and ledger_entries had RLS enabled above but carried no
-- policy at all until the recursion fix — meaning default-deny for every
-- role, including legitimate managers and claimed helpers. None of the
-- three carry household_id directly, so each is scoped by joining through
-- helper_profiles, which does.
CREATE POLICY quick_utos_isolation ON public.quick_utos
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = quick_utos.recipient_id
              AND hp.household_id = public.current_household_id()
        )
    );

CREATE POLICY vales_isolation ON public.vales
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );

CREATE POLICY ledger_entries_isolation ON public.ledger_entries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = ledger_entries.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );

-- invite_flags is scoped the same way as quick_utos/vales/ledger_entries
-- for authenticated, in-household callers (covers the manager-side wage
-- compliance warning insert in inviteHelperFn, and lets managers read
-- flags for their own household's invites). The anonymous flag path
-- (a claimant flagging a term mismatch before they've claimed an
-- account, POST /api/helpers/claim/flag — Section 7.1) has no auth.uid()
-- for this policy to check against; it goes through the flag_invite()
-- SECURITY DEFINER function below instead, which bypasses this policy
-- entirely and re-validates the invite_code itself rather than trusting
-- the caller.
CREATE POLICY invite_flags_isolation ON public.invite_flags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = invite_flags.invite_id
              AND hp.household_id = public.current_household_id()
        )
    );

-- --------------------------------------------------
-- CLAIM-FLOW SECURITY DEFINER FUNCTIONS
-- --------------------------------------------------
-- The invite/claim handshake (Section 7.1) has three steps that run
-- before the caller has a usable household_id for RLS to check against:
-- looking up an invite by code (anonymous), flagging a term mismatch
-- (anonymous), and writing a brand-new helper's own first user_profiles
-- row (authenticated, but current_household_id() has nothing to look up
-- yet — see below). All three previously ran as direct table calls from
-- people.actions.ts and all three always failed under RLS. Fixed by
-- supabase/fix-claim-flow-rls-gaps.sql, discovered auditing the
-- household recursion fix above. See that file for the full incident
-- notes.
--
-- lookup_pending_invite / flag_invite: anonymous callers have no
-- auth.uid(), so no household-scoped policy on helper_profiles or
-- invite_flags can ever admit them (current_household_id() resolves to
-- NULL for a NULL auth.uid(), and `household_id = NULL` is never true).
-- These SECURITY DEFINER functions validate the invite_code internally
-- instead of relying on a blanket anon-facing table policy.
CREATE OR REPLACE FUNCTION public.lookup_pending_invite(p_invite_code TEXT)
RETURNS TABLE (
    id UUID,
    household_id UUID,
    name TEXT,
    station TEXT,
    monthly_rate NUMERIC,
    shift_start TIME,
    shift_end TIME,
    weekly_rest_day INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT id, household_id, name, station, monthly_rate, shift_start, shift_end, weekly_rest_day
    FROM public.helper_profiles
    WHERE invite_code = p_invite_code
      AND status = 'PENDING_CLAIM';
$$;

GRANT EXECUTE ON FUNCTION public.lookup_pending_invite(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.flag_invite(p_invite_code TEXT, p_field TEXT, p_note TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite_id UUID;
    v_flag_id UUID;
BEGIN
    SELECT id INTO v_invite_id
    FROM public.helper_profiles
    WHERE invite_code = p_invite_code
      AND status = 'PENDING_CLAIM';

    IF v_invite_id IS NULL THEN
        RAISE EXCEPTION 'Invitation code not found';
    END IF;

    INSERT INTO public.invite_flags (invite_id, field, note)
    VALUES (v_invite_id, p_field, p_note)
    RETURNING id INTO v_flag_id;

    RETURN v_flag_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_invite(TEXT, TEXT, TEXT) TO anon, authenticated;

-- claim_helper_invite: a newly authenticated helper inserting their own
-- first user_profiles row hits a bootstrap problem, not an anonymity
-- problem. Postgres uses a FOR ALL policy's USING clause as its WITH
-- CHECK when no separate WITH CHECK is given, so this INSERT is checked
-- against user_profiles_isolation's `household_id =
-- current_household_id()` — but current_household_id() looks up the
-- caller's *existing* user_profiles row, which doesn't exist until this
-- INSERT completes. The check can never pass. This SECURITY DEFINER
-- function creates the user_profiles row and activates the matching
-- helper_profiles row atomically, bypassing that bootstrap deadlock.
-- auth.uid() still reflects the calling JWT inside a SECURITY DEFINER
-- function, so this can only ever act on the authenticated caller's own
-- account.
CREATE OR REPLACE FUNCTION public.claim_helper_invite(p_invite_code TEXT)
RETURNS TABLE (helper_id UUID, household_id UUID, full_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_helper public.helper_profiles%ROWTYPE;
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_helper
    FROM public.helper_profiles
    WHERE invite_code = p_invite_code
      AND status = 'PENDING_CLAIM';

    IF v_helper.id IS NULL THEN
        RAISE EXCEPTION 'Invitation code not found or already claimed';
    END IF;

    INSERT INTO public.user_profiles (id, household_id, full_name, user_type)
    VALUES (v_uid, v_helper.household_id, v_helper.name, 'helper');

    UPDATE public.helper_profiles
    SET user_id = v_uid, status = 'ACTIVE'
    WHERE id = v_helper.id;

    RETURN QUERY SELECT v_helper.id, v_helper.household_id, v_helper.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_helper_invite(TEXT) TO authenticated;

-- --------------------------------------------------
-- HOUSEHOLDS TABLE + MANAGER BOOTSTRAP
-- --------------------------------------------------
-- household_id was, until now, a bare UUID repeated on every table with no
-- owning row -- fine while nothing needed a household display name or a
-- home for household-level settings, but the manager-facing invite/auth
-- work below needs one. Confirmed additive and safe for LINARA_MOBILE,
-- which only ever consumes household_id as an opaque UUID via the RPCs
-- above, never queries a households table directly.
-- petty_cash_budget (added by supabase/add-household-petty-cash-budget.sql)
-- closes KNOWN_GAPS.md gap #2's budget half -- one recurring household-level
-- allocation, manager-writable from LINARA (grocery.actions.ts), read by
-- both apps (LINARA_MOBILE's use-palengke-budget.ts already anticipated
-- this in its own doc comment before it existed). See Closed Gap C13.
CREATE TABLE public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'My Household',
    petty_cash_budget NUMERIC(10,2) NOT NULL DEFAULT 1500,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

CREATE POLICY households_isolation ON public.households
    FOR SELECT USING (id = public.current_household_id());
-- No INSERT policy: household *creation* only ever happens through
-- bootstrap_manager_household() below, SECURITY DEFINER, bypasses RLS (the
-- chicken-and-egg deadlock comment just below explains why). Updating an
-- *existing* household's budget has no such deadlock, so it gets a plain
-- household-scoped UPDATE policy instead of needing its own RPC:
CREATE POLICY households_update_budget ON public.households
    FOR UPDATE USING (id = public.current_household_id())
    WITH CHECK (id = public.current_household_id());
-- Manager-only enforcement for that UPDATE happens in application code
-- (updateHouseholdBudgetFn), matching insertHouseSopFn/decideValeFn's
-- existing pattern of doing role checks in the server function rather than
-- encoding roles into RLS.

-- bootstrap_manager_household: the same current_household_id() chicken-
-- and-egg deadlock that claim_helper_invite() solves for helpers applies
-- identically to a brand-new manager's own first user_profiles row --
-- inserting it is checked against household_id = current_household_id(),
-- which needs an existing row to resolve, which doesn't exist yet. Same
-- fix, same technique.
CREATE OR REPLACE FUNCTION public.bootstrap_manager_household(
    p_full_name TEXT,
    p_household_name TEXT DEFAULT NULL
)
RETURNS TABLE (user_id UUID, household_id UUID, full_name TEXT, user_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_existing public.user_profiles%ROWTYPE;
    v_household_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Idempotent: a page refresh mid-flow, or the confirm-email-then-log-in
    -- flow calling this a second time at first login, returns the
    -- already-bootstrapped profile instead of erroring on a duplicate insert.
    SELECT * INTO v_existing FROM public.user_profiles WHERE id = v_uid;
    IF v_existing.id IS NOT NULL THEN
        RETURN QUERY SELECT v_existing.id, v_existing.household_id, v_existing.full_name, v_existing.user_type;
        RETURN;
    END IF;

    INSERT INTO public.households (name)
    VALUES (COALESCE(NULLIF(TRIM(p_household_name), ''), 'My Household'))
    RETURNING id INTO v_household_id;

    INSERT INTO public.user_profiles (id, household_id, full_name, user_type)
    VALUES (v_uid, v_household_id, p_full_name, 'primary_manager');

    RETURN QUERY SELECT v_uid, v_household_id, p_full_name, 'primary_manager'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_manager_household(TEXT, TEXT) TO authenticated;
-- Not granted to anon (unlike lookup_pending_invite/flag_invite above):
-- this must only ever run for a caller who has already completed
-- auth.signUp/signIn, exactly mirroring claim_helper_invite's pattern.
```

---

## 9. State and Context Handling

### 9.1 The Simulated Clock (`simOffsetMs`)

To facilitate accurate shift transitions and testing of off-hours alerts, simulated time offsets are kept globally:

```typescript
interface ClockState {
  simOffsetMs: number; // Milliseconds between local system and simulated time
  getCurrentTime: () => Date; // Returns new Date(Date.now() + simOffsetMs)
}
```

All system triggers (e.g., quiet-hours, night-purges, shifts) validate relative to `getCurrentTime()` rather than the user's unadjusted machine time.

### 9.2 The Grocery State Context

`GroceryCtx` coordinates between Pantry stocking and the active Palengke checklist:

- `pantryAutoSuggestions` are populated dynamically on load by selecting `pantry_items` where `qty <= par`.
- `manualGroceryItems` contains manual purchases added to the list.
- Once a helper completes a Palengke Run task, the client triggers a transaction:
  1. Sets `bought = true` on the `grocery_items` rows.
  2. Increments `qty` in `pantry_items` to match the required `par` limits.

---

## 10. Error Handling Strategy

### 10.1 Authentication & Credential Anomalies

- **Session Expiry:** A client interceptor captures HTTP `401 Unauthorized` responses and triggers GoTrue's session refresh. If token refresh fails, local cache is purged, and the user is redirected to `<AuthScreen />` displaying an error toast: `"Session expired. Please log in again."`
- **Handshake Wage Flagging:** During the claiming process, if a helper notices incorrect terms (such as wage rates below their verbal agreements) and taps `"Something's not right?"`, the registration process is suspended, and the mismatch is reported in the manager's `<NeedsYou />` panel.

### 10.2 Invalid & Empty API Responses

- **Reachability Warnings:** When dispatching a Quick Uto while the recipient is `Off`, the API interrupts and returns a reachability warning:
  ```json
  {
    "error": "RECIPIENT_UNAVAILABLE",
    "message": "Rosa is currently Off-Shift. Proceeding will trigger off-hours logs.",
    "accrualRate": "30m"
  }
  ```
  The client catches this to display the friction modal, forcing the manager to confirm the override parameters before executing the request.
- **Network Failure Resilience:** In-progress ticket updates are captured inside local IndexedDB. If an image upload fails, the task state is kept in the client queue and retried when network state transitions back to online.

---

## 11. Local Deployment Model

### 11.1 Local Environment Variables (`.env`)

Create a `.env` file in the project's root folder:

```env
# 1. Supabase Local Configuration Coordinates (Run via Supabase CLI)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsLWVudmlyb25tZW50Ii...

# 2. Security Tokens
JWT_SECRET=super_secret_local_dev_jwt_key_string_32_chars
SYSTEM_CRON_SECRET=local_cron_purger_verification_hash_192837

# 3. regional labor parameter configuration
REGIONAL_MINIMUM_WAGE=6000.00
```

### 11.2 Run & Verification Procedures

#### 1. Setup Dependencies

Verify your Bun environment is active, then install dependencies:

```bash
bun install
```

#### 2. Apply Database Schema

Execute the normalization SQL script defined in Section 8 of this document directly onto your local PostgreSQL instance or via the Supabase SQL editor.

#### 3. Run Development Server

Start the local server using:

```bash
bun dev
```

The application will boot and run on `http://localhost:8080`. Open multiple browser tabs (tab 1 as `Sir Ben`, tab 2 as `Ate Rosa`) to test live handshakes, real-time ticket movements, and inventory counters.

#### 4. Project Build & Checks

To test compilation, linting, and formatting:

```bash
# Build the application output and edge servers
bun run build

# Run linting tests and check types
bun run lint
bun run typecheck
bun run format:check
```

_Note: Never edit [`src/routeTree.gen.ts`](src/routeTree.gen.ts) manually; TanStack Router updates this automatically on change during `bun dev`._
