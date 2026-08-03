# Linara Home — Kitchen-Style Operating System for the Filipino Household

Linara (app) / Linara Home (product & entity) is a comprehensive kitchen-style operating system designed specifically for coordinating modern Filipino households. Inspired by professional kitchen passes and station structures, Linara aligns family managers and household staff (kasambahay, yaya, cook, driver, all-around) on clear terms of work, schedules, compensation, and rest, ensuring dignity by design and high operational clarity.

For deeper project specifications and technical layouts, please refer to the following background documentation:

- Product Requirements Document: [`plan.md`](plan.md)
- System Architecture Blueprint: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Conceptual Foundations: [`home-management-concept.md`](home-management-concept.md)
- Design Tokens & Globals: [`src/styles.css`](src/styles.css)

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
- **Rescheduling Propagation:** If Sir's flight is delayed to Friday at 9:00 AM, the manager shifts the appointment. The system automatically recalculates and shifts all dependent tasks, highlighting the shift on the helper's station without silent schedule changes.

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

## 4. Technical Architecture

Linara is structured as an N-Tier architecture designed to handle unreliable network states and maintain high-fidelity separation of concerns:

- **Frontend SPA / SSR Shell:** React 19 / TanStack Start v1 (powered by Vite 8).
- **Routing:** TanStack Router v1 (fully typed, file-based routes under `src/routes/`).
- **Styling:** Tailwind CSS v4 featuring warm design tokens (Teal, Sand, Cream, Terracotta) inside [`src/styles.css`](src/styles.css).
- **Database & Auth:** Supabase PostgreSQL with strict Row-Level Security (RLS) policies and GoTrue Auth.
- **Client Cache:** TanStack Query v5 + IndexedDB / LocalStorage queue for offline-first support.
- **APIs:** Type-safe Server Functions (`createServerFn`).
- **Server Runtime:** Nitro v3 Edge server bundling.

---

## 5. Project Directory Structure

```text
.
├── ARCHITECTURE.md              ← System technical architecture blueprint
├── README.md                    ← This setup and overview documentation
├── plan.md                      ← Product Requirements Document (PRD) — Single Source of Truth
├── package.json                 ← Bun-managed dependencies
├── vite.config.ts               ← Tailwind + Nitro + Start + React plugins configuration
├── tsconfig.json                ← Strict TypeScript configuration with @/* path aliases
├── components.json              ← shadcn/ui design setup file
├── eslint.config.js             ← ESLint 9 configuration
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
    └── lib/                     ← Standard cn() helper, SSR error capturing
```

---

## 6. Local Development & Setup

Follow these steps to set up and run the Linara application locally:

### 6.1 Prerequisites

- [Bun runtime](https://bun.sh/) (v1.1+ recommended)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (or access to a running Postgres database instance)
- Node.js 20+ (if you wish to run the built server with `node` rather than `bun`)

### 6.2 Installation Steps

1.  **Clone the Repository:**

    ```bash
    git clone <repository-url>
    cd LINARA
    ```

2.  **Install Dependencies:**
    Use Bun to install required libraries and setup packages:

    ```bash
    bun install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory. You can copy the template from `.env.sample` (or `.env.example`):

    ```bash
    cp .env.example .env
    ```

    Provide valid Supabase coordinates, JWT credentials, and local configuration flags inside `.env`:

    ```env
    # Supabase Coordinates
    SUPABASE_URL=http://localhost:54321
    SUPABASE_ANON_KEY=your_supabase_anon_key

    # Server Run Credentials
    JWT_SECRET=your_32_character_jwt_secret
    SYSTEM_CRON_SECRET=your_system_cron_secret

    # Regional labor configuration
    REGIONAL_MINIMUM_WAGE=6000.00
    ```

4.  **Initialize Database Schema:**
    Apply the normalization SQL setup definitions (detailed in [`ARCHITECTURE.md`](ARCHITECTURE.md) Section 8) to your local PostgreSQL instance or configure them via the Supabase Dashboard SQL Editor.

5.  **Start Development Server:**
    Run the local Vite web worker environment:
    ```bash
    bun dev
    ```
    The application will bind to `http://localhost:8080`.

---

## 7. Production Build & Commands

To build and compile the application for production, use the following scripts:

```bash
# Build production-ready server and client output assets
bun run build          # → .output/ (server) + .output/public/ (client assets)

# Run Vite dev pipeline in development mode
bun run build:dev

# Preview production build locally
bun run preview        # serves the production build on http://localhost:8080

# Execute ESLint inspections
bun run lint

# Automatically format project files via Prettier
bun run format

# Verify formatting only
bun run format:check

# Execute TypeScript type checker
bun run typecheck
```

---

## 8. Deployment Notes

`bun run build` produces a highly optimized Nitro server bundle in `.output/`, runnable anywhere Node or Bun is available:

```bash
node .output/server/index.mjs   # PORT=3000 by default
```

For specific platform targets (e.g. Cloudflare Workers, Vercel, Netlify), set the matching Nitro preset via the `nitro()` plugin options inside `vite.config.ts` or set the `NITRO_PRESET` environment variable prior to rebuilding.

---

## 9. Operational Testing & Personas Sim

To test real-time features and boundaries during development:

1.  Open **Tab 1** in your browser and log in as a **Primary Manager** persona (e.g. _Sir Ben_).
2.  Open **Tab 2** (or use an Incognito window) and log in as a **Helper** persona (e.g. _Ate Rosa_).
3.  Use the integrated **Simulated Clock Controller** (`simOffsetMs` dynamic header clock) to jump forward/backward in time to trigger off-shift alerts, task transitions, nightly purges, and after-hours overtime compensation approvals.
