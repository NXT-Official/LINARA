# Linara Home — Kitchen-Style Operating System for the Filipino Household

Linara (app) / Linara Home (product & entity) is a comprehensive kitchen-style operating system designed specifically for coordinating modern Filipino households. Inspired by professional kitchen passes and station structures, Linara aligns family managers and household staff (kasambahay, yaya, cook, driver, all-around) on clear terms of work, schedules, compensation, and rest, ensuring dignity by design and high operational clarity.

For deeper project specifications and technical layouts, please refer to the following background documentation:

- Product Requirements Document: [`plan.md`](plan.md)
- System Architecture Blueprint: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Conceptual Foundations: [`home-management-concept.md`](home-management-concept.md)
- Design Tokens & Globals: [`src/styles.css`](src/styles.css)
- Feature Composition Root: [`src/features/dashboard/components/app-store-provider.tsx`](src/features/dashboard/components/app-store-provider.tsx)

---

## 1. High-Level Vision & Objectives

Informal domestic work in the Philippines often lacks systematic recording. Traditional household management relying heavily on raw messaging apps (Viber, SMS, Messenger) leads to high turnover, communication friction, and a lack of verifiable work history for helpers.

Linara addresses these challenges by modeling the home like a professional kitchen:

- **Clarity over Control:** Tasks are represented as structured tickets associated with specific "Stations," carrying standard "House Standards" (Standard Operating Procedures - SOPs).
- **Dignity by Design:** Helpers are first-class users who own their personal accounts, login credentials, and completed task history. This portable record can be carried to future employers.
- **Filipino-First Realities:** Built-in support for Batas Kasambahay guidelines (RA 10361), vales (salary advances), 13th-month accruals, palengke (wet market) budgets, live-in/live-out shift rest boundaries, and Taglish communication chips.
- **OFW Presence:** Remote managers (e.g., Overseas Filipino Workers) can monitor home operations and manage payroll from abroad without micro-managing or invading helper privacy.

---

## 2. User Roles & Permissions

Linara coordinates three key administrative stakeholders and the household staff (Kasambahay) with strict boundaries:

| Permission / Power             | Primary Manager (On-Site)  | Co-Manager (On-Site)       | Remote Admin (OFW)                            | Helper (Kasambahay)     |
| :----------------------------- | :------------------------- | :------------------------- | :-------------------------------------------- | :---------------------- |
| **Manage Admins & Helpers**    | Yes                        | No                         | No                                            | No                      |
| **Edit Schedules & Rest Days** | Yes                        | Yes                        | View-Only                                     | View-Only               |
| **Assign / Approve Tickets**   | Yes (Live)                 | Yes (Live)                 | Suggested by default, Live on urgent override | View-Only / Claimable   |
| **Approve Vales & Budgets**    | Yes                        | Yes                        | Yes (Usually funding source)                  | No                      |
| **Override Helper Off-Hours**  | Yes (With logged friction) | Yes (With logged friction) | No                                            | N/A                     |
| **View Money & Pay Ledger**    | Yes                        | Yes                        | Yes                                           | Yes (Own record only)   |
| **Access "My Notes"**          | No                         | No                         | No                                            | Yes (Private to Helper) |

---

## 3. Five Core Operational Workflows

### 3.1 Onboarding and Account Handshake (With Terms Flagging)

To prevent employers from controlling helper credentials, onboarding uses a strict digital handshake.

1.  **Terms Setup:** The Primary Manager inputs the worker's parameters (Name, Station, Base Wage, Shift Start/End, Weekly Rest Day) in the app.
2.  **Invitation Code:** The system generates a single-use 6-character alphanumeric `Invitation Code` (e.g., `LN98A2`).
3.  **Helper Claim & Audit:** The helper logs into the Linara App on their device, enters the code, and reviews the read-only summary of the terms.
    - _If terms match:_ The helper inputs their own secure password, claims the seat, and locks the account. The profile transitions to `ACTIVE`.
    - _If terms mismatch:_ The helper taps `"Something's not right?"`, flags specific fields (e.g. wage rate, shift start), and logs feedback notes. The claim is suspended and discrepancy records are written to the `invite_flags` table, surfacing immediately in the manager's `<NeedsYou />` panel.
4.  **Ownership:** The employer has no access to the helper's credentials. If the helper leaves the household, their account and completed task history remain their personal property.

### 3.2 Anchor-Based Appointment Tasks

Appointments act as schedule anchors, generating preparation tasks that fire backward in time.

- **Anchor Setup:** A manager adds an Appointment: `"Sir's Flight"` on Friday at 6:00 AM using an event recipe template.
- **Lead Time Calculations:** The template dictates dependent tasks:
  - `Pack bags` (Lead time: `-10 hours` -> Thursday at 8:00 PM)
  - `Prepare baon` (Lead time: `-2 hours` -> Friday at 4:00 AM)
  - `Wake driver & load car` (Lead time: `-45 minutes` -> Friday at 5:15 AM)
- **Rescheduling Propagation:** If Sir's flight is delayed to Friday at 9:00 AM, the manager shifts the appointment. The system automatically recalculates and shifts all dependent tasks, highlighting the shift on the helper's station without silent schedule changes via [`computePrepSchedule()`](src/lib/time.ts:55).

### 3.3 Quick Utos & Nightly Purge

Handles trivial, short-order requests (e.g., "Add more rice," "Come to kitchen") without bloating formal task boards or creating open-ended chat rooms.

- **Lightweight Delivery:** Managers tap "Quick Uto" and choose a quick-chip, text, or a short 15-second voice snippet.
- **Shift Awareness:** Held in queue if the helper is `Off-Shift`; sent live if the helper is `On-Shift`.
- **One-Tap Acknowledgment:** Appears on the helper's station as a floating chip with a single `"Got it"` or `"Done"` action button.
- **Midnight Purge:** To prevent performance scoring or historical over-scrutiny, all individual Quick Utos are permanently deleted from the database at midnight. The system increments an aggregated daily count showing the manager a gentle mirror (`"You sent 12 small asks today"`), then resets the counter.

### 3.4 After-Hours Escalation & Ledger Accrual

Protects live-in helpers' rest boundaries while allowing managers to handle critical emergencies.

- **Friction Wall:** Sending a task or Quick Uto to an off-shift helper triggers a warning block: `"Rosa is currently Off-Shift. Proceeding will log 30 mins of Rest Owed."`
- **Emergency Override:** If the manager overrides, the helper receives a high-priority alert.
- **Time-Off in Lieu:** Once marked done, the system logs the exact duration (minimum 30 minutes) on the `After-Hours Ledger`, incrementing `"Rest Owed"` hours. Both the manager's and helper's dashboards update in real-time.

### 3.5 Pantry-to-Palengke Reconciliation

Ties kitchen inventory levels to shopping runs, cash spend, and budget tracking.

1.  **Low Stock Detection:** The cook updates the pantry: `Rice` falls to `2kg` (below its `10kg` Par Level).
2.  **Auto-Shopping Checklist:** The next "Palengke Run" task automatically includes `Rice: 8kg needed` along with a designated cash budget (e.g., `₱1,500`).
3.  **Cost & Receipt Capture:** The helper purchases the items, enters actual costs (e.g., `Rice: ₱480`), takes a photo of the receipt, and clicks complete.
4.  **Reconciliation:** The manager's dashboard spend dial live-updates (₱1,120 spent, ₱380 remaining) and displays the uploaded receipt image.

---

## 4. Technical Architecture & Modular Layout

Linara is structured as an N-Tier architecture designed to handle unreliable network states and maintain high-fidelity separation of concerns:

- **Frontend SPA / SSR Shell:** React 19 / TanStack Start v1 (powered by Vite 8).
- **Routing:** TanStack Router v1 (fully typed, file-based routes under `src/routes/`).
- **Styling:** Tailwind CSS v4 featuring warm design tokens (Teal, Sand, Cream, Terracotta) inside [`src/styles.css`](src/styles.css).
- **Database & Auth:** Supabase PostgreSQL with strict Row-Level Security (RLS) policies and GoTrue Auth.
- **Client Cache:** TanStack Query v5 + IndexedDB queue for offline-first support.
- **APIs:** Type-safe Server Functions (`createServerFn`).
- **Server Runtime:** Nitro v3 Edge server bundling.

### 4.1 Modular Feature Directories

To maintain codebase cleanliness, the project features have been extracted from monolithic entry points into structured folders under `src/features/`. Each folder encapsulates its respective types, hooks, components, and actions:

- **`appointments/`** — Schedule anchors and dependent task calculations.
- **`availability/`** — Duty monitoring, rest boundaries, quiet hour gating rules.
- **`dashboard/`** — Layout shells, simulated clock controllers, workspace navigation, and shared application context.
- **`groceries/`** — Shopping checklists, cost entries, and shared market context.
- **`ledger/`** — After-hours compensation journals, REST-owed hour meters, vales advances, and fintech previews.
- **`notes/`** — Helper-private digital scratchpads (completely hidden from managers).
- **`pantry/`** — Inventory level monitoring, Par value definitions, and low-par alerts.
- **`people/`** — Single-use claim invitations, secure digital handshakes, and helper profiles.
- **`shifts/`** — Structured duty schedules and calendars.
- **`tasks/`** — Core task boards, status trackers (todo, in progress, done, blocked), and SOP instruction cards.
- **`utos/`** — Ephemeral short-order commands.

### 4.2 Application Composition Root

The shared application store and real-time syncing pipelines are consolidated in the composition root: [`src/features/dashboard/components/app-store-provider.tsx`](src/features/dashboard/components/app-store-provider.tsx). It encapsulates feature-specific states and provides them downstream via `AppStoreContext` so page routing transitions do not remount active daily sessions.

---

## 5. Supabase Database Schema & RLS Security

Linara maps household relationships and interactions via a highly relational PostgreSQL schema. Complete definitions can be inspected in Section 8 of [`ARCHITECTURE.md`](ARCHITECTURE.md).

### 5.1 Central Schemas & Relations

1.  **`user_profiles`** — Tracks global registered users.
2.  **`helper_profiles`** — Captures the formal terms of work including `base_wage`, shift hours (`shift_start`, `shift_end`), rest days, and current status (`PENDING` or `ACTIVE`).
3.  **`house_sops`** — Custom standard procedures mapped to specific stations.
4.  **`tickets`** — Standard task records carrying status states (`'todo'`, `'in_progress'`, `'done'`, `'blocked'`) and optional image evidence URLs.
5.  **`appointments`** — Calendar anchors used to compute preparation chains.
6.  **`ledger_entries`** — Tracks after-hours occurrences and maps them to accumulated "Rest Owed" hours.
7.  **`vales`** — Digital records of advanced salary amounts and approvals.
8.  **`pantry_items`** & **`grocery_items`** — Real-time kitchen inventory and matching shopping run registers.
9.  **`quick_utos`** — Short-order commands.
10. **`helper_notes`** — Secure scratchpad rows written and owned by the helper.
11. **`invite_flags`** — Log files capturing mismatch arguments flagged by the helper during the onboarding handshake.

### 5.2 Row-Level Security (RLS) Isolation

To protect privacy and ensure absolute multi-tenant boundaries:

- **Tenant Isolation:** All operational tables carry a `household_id` UUID column. Active RLS policies restrict SELECT/INSERT/UPDATE/DELETE queries, allowing users to query only rows containing their authorized `household_id`.
- **Helper Private Notes:** Tables like `helper_notes` enforce a strict policy matching the authenticated user's credentials (`auth.uid()`). Familiy managers and administrative employers have **no database privilege** to read or mutate helper scratchpads.

---

## 6. AI Integration Layer (Live vs. Mock AI)

Linara leverages artificial intelligence to organize household operations without imposing dry, corporate language constructs.

### 6.1 The client-side fallback `USE_MOCK_AI`

During local offline work or testing cycles, developers can bypass live LLM costs and latency by setting `USE_MOCK_AI=true` inside `.env`. This activates the high-fidelity mock engines (e.g. [`generateMockSOP()`](supabase/functions/generate-sop/index.ts:15)) to instantly resolve realistic Taglish schemas.

### 6.2 Supabase Edge Functions

The system contains three dedicated serverless Deno edge functions located under `supabase/functions/`:

1.  **`generate-sop/`** — Evaluates raw prompts (e.g., "how to prepare formula") and uses structured JSON schema configurations to output formal, warm, step-by-step SOPs mapped to designated stations (Yaya, Cook, etc.).
2.  **`parse-scheduler/`** — Takes natural language entries and parses recurring schedulers.
3.  **`route-utos/`** — Categorizes incoming "Utos" tasks and triggers warnings if they violate a worker's shift rest windows.

---

## 7. Batas Kasambahay & Regional Labor Compliance

To elevate domestic work into a formal, respected profession, Linara provides automatic compliance audits aligned with Republic Act 10361:

- **Minimum Wage Verification:** If a helper's wage parameters fall below the `REGIONAL_MINIMUM_WAGE` value configured in `.env`, the system immediately displays an inline legal warning card citing compliance issues.
- **Legal Contribution Rules:** If a worker's monthly base wage is set below ₱5,000, SSS, PhilHealth, and Pag-IBIG allocations compute 100% of contributions as employer-covered. Above this limit, standard employee-employer splits are calculated.
- **Interactive Dashboard Dials:** Custom SVG progress meters represent budget spends, completed task velocities, and proximity to the next payday.
- **Fintech Webhook Previews:** Includes a "Transfer via GCash / Maya" payload preview modal displaying the exact raw JSON transaction payload destined for payout partners, allowing instant auditing before committing real-world disbursements.

---

## 8. Real-time & Offline-First Core

To handle erratic local connectivity without throwing critical errors:

- **Supabase Realtime Sync:** Subscribes to live PostgreSQL transactions via `household-board-channel` and `quick-utos-channel`. Ticket changes, Quick Utos alerts, and ledger adjustments broadcast instantaneously between managers and helpers.
- **IndexedDB Offline Queue:** Managed in [`src/lib/offline-queue.ts`](src/lib/offline-queue.ts), offline actions (e.g., status updates, receipt image capture) are stored securely in local browser memory via [`addToQueue()`](src/lib/offline-queue.ts:43). Once connectivity re-hydrates, the system automatically triggers a sync loop, committing the queue items and resolving state conflicts seamlessly.

---

## 9. Project Directory Structure

```text
.
├── ARCHITECTURE.md              ← System technical architecture blueprint
├── README.md                    ← This setup and overview documentation
├── plan.md                      ← Product Requirements Document (PRD) — Single Source of Truth
├── package.json                 ← Bun-managed dependencies
├── vite.config.ts               ← Tailwind + Nitro + Start + React plugins configuration
├── tsconfig.json                ← Strict TypeScript configuration with @/* path aliases
├── components.json              ← shadcn/ui design setup file
├── eslint.config.js             ← ESLint 9 configuration with strict SAST rules
└── src/
    ├── router.tsx               ← createRouter() + QueryClient initialization
    ├── start.ts                 ← TanStack Start client bootstrapper
    ├── server.ts                ← Nitro SSR entry wrapper (catches SSR failures safely)
    ├── styles.css               ← Tailwind v4 @theme tokens + base layer
    ├── routeTree.gen.ts         ← Generated by the TanStack Router plugin — Do not edit
    ├── routes/
    │   ├── __root.tsx           ← HTML shell, head/meta, providers, 404 + error boundaries
    │   ├── index.tsx            ← Route `/` — redirects to /manager/pass
    │   ├── _app.tsx             ← pathless layout: AppStoreProvider context + app shell
    │   └── _app/                ← `/manager/*` and `/helper/*` page routes
    ├── features/                ← Domain-driven features (pages, hooks, components)
    │   ├── appointments/        ← Fixed events + backward-computed preparation routines
    │   ├── availability/        ← Shift tracking, quiet-hours gating, send gates
    │   ├── dashboard/           ← Shared application stores, sim-clock, manager/helper layouts
    │   ├── groceries/           ← Shopping list, receipt slots, spend tracking context
    │   ├── ledger/              ← After-hours ledger, REST-owed accrual calculations, vales
    │   ├── notes/               ← Helper private notepad (scratchpad)
    │   ├── pantry/              ← Stock level tracker and PAR values
    │   ├── people/              ← Household membership & invite handshake APIs
    │   ├── shifts/              ← Shift schedules and calendar day-editors
    │   ├── tasks/               ← Routines, Kanban boards, and SOP standards cards
    │   └── utos/                ← Ephemeral short-order quick asks
    ├── components/
    │   └── ui/                  ← shadcn-style Radix UI primitives (button, card, dialog, etc.)
    ├── hooks/                   ← Shared hooks (use-mobile, use-mounted)
    └── lib/                     ← Standard cn() helper, SSR error capturing, offline queue
```

---

## 10. Local Development & Setup

### 10.1 Prerequisites

- [Bun runtime](https://bun.sh/) (v1.1+ recommended)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (or access to a running Postgres database instance)
- Node.js 20+ (if running server tasks via Node)

### 10.2 Installation Steps

1.  **Clone the Repository:**

    ```bash
    git clone <repository-url>
    cd LINARA
    ```

2.  **Install Dependencies:**

    ```bash
    bun install
    ```

3.  **Configure Environment Variables:**
    Copy the `.env.example` file to `.env`:

    ```bash
    cp .env.example .env
    ```

    Populate the file with your local database coordinates, system secrets, and keys:

    ```env
    SUPABASE_URL=http://localhost:54321
    SUPABASE_ANON_KEY=your_supabase_anon_key
    JWT_SECRET=your_32_character_jwt_secret
    SYSTEM_CRON_SECRET=your_system_cron_secret
    REGIONAL_MINIMUM_WAGE=6000.00
    USE_MOCK_AI=true
    ```

4.  **Start Development Server:**
    ```bash
    bun dev
    ```
    The application will bind to `http://localhost:8080`.

---

## 11. Production Build & Commands

To build and compile the application for production, use the following scripts:

```bash
# Build production-ready server and client output assets
bun run build          # → .output/ (server) + .output/public/ (client assets)

# Run Vite dev pipeline in development mode
bun run build:dev

# Preview production build locally
bun run preview        # serves the production build on http://localhost:8080

# Execute ESLint inspections with strict SAST guardrails
bun run lint

# Automatically format project files via Prettier
bun run format

# Verify formatting only
bun run format:check

# Execute TypeScript type checker
bun run typecheck
```

---

## 12. Deployment Notes

`bun run build` produces an optimized Nitro server bundle in `.output/`, runnable anywhere Node or Bun is available:

```bash
node .output/server/index.mjs   # PORT=3000 by default
```

For specific platform targets (e.g. Cloudflare Workers, Vercel, Netlify), set the matching Nitro preset via the `nitro()` plugin options inside [`vite.config.ts`](vite.config.ts) or set the `NITRO_PRESET` environment variable prior to rebuilding.

---

## 13. Testing Guide & Quality Gates

To protect against regression bugs and maintain strict quality standards, Linara carries double testing frameworks:

### 13.1 Unit & Integration Testing (Vitest)

Vitest is configured to run fast, serverless unit checks (such as date transformations and wage computations):

```bash
# Run unit tests
bun run test

# Run tests in hot watch mode
bun run test:watch
```

Unit tests are kept clean from browser layout behaviors and operate in a high-speed sandbox environment.

### 13.2 Browser End-to-End Testing (Playwright)

Playwright runs physical browser-driven evaluations. It executes full user flows (such as launching the portal, checking Ate Rosa's landing layout, triggering claimant forms, and rendering modal claims):

```bash
# Execute end-to-end browser specs
bun run test:e2e
```

**Quality Gates & Safeguards:**

- **Console Error Capture:** E2E tests automatically capture, filter, and pipe browser runtime exceptions directly to the local terminal, preventing silent JS failures in front-end components.
- **Hydration Wait Guard:** E2E specs incorporate hydration guards (`networkidle` states and small micro-delays) to guarantee React binds click event handlers correctly before clicking on button nodes, eliminating race-condition test failures.

---

## 14. Troubleshooting & Developer FAQ

### Q1: Why do absolute import routes throwing path resolution errors in Node scripts?

Ensure your environment loads aliases matching your [`tsconfig.json`](tsconfig.json). In [`vite.config.ts`](vite.config.ts), we set `resolve: { tsconfigPaths: true }` to automatically direct `@/*` aliases during build times.

### Q2: How can I resolve Vite port 8080 conflicts?

If port 8080 is blocked by another project, edit [`vite.config.ts`](vite.config.ts) server port settings or pass port arguments to the CLI script:

```bash
bun dev --port 8081
```

### Q3: Why does my browser block Edge function queries due to CORS errors?

Deno edge functions under `supabase/functions/` must handle HTTP preflight requests (`OPTIONS` method) by returning standard access control headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`). If headers are omitted or mismatched, browser calls will be rejected.

### Q4: I am seeing Hydration Mismatch warnings on page loads. How can I resolve them?

TanStack Start uses SSR. If a client component renders timestamp formats using localized browser dates (which vary based on user local timezones), the SSR result will differ from the client's output, prompting a warning. To fix this:

1. Use our simulated offset hooks to synchronize timezones.
2. Bind time displays inside components using client-only mounts (`useMounted`).

### Q5: How do I audit off-shift warnings and ledger calculations?

Open two windows:

- **Window 1 (Manager Pass):** Add a task to Ate Rosa during her off-shift rest window. The system will display the friction modal. Proceed with the task.
- **Window 2 (Worker Station):** Open Ate Rosa's dashboard and complete the task. Check both logs to observe the automatic minimum 30-minute Rest Owed ledger accrual reflected in the real-time databases.
