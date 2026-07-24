# Linara Home — System Architecture & Technical Blueprint

This document defines the complete technical architecture, API design, database schema, and data flow patterns for **Linara** (app) / **Linara Home** (product & entity). It transitions the single-file front-end prototype in [`src/routes/index.tsx`](src/routes/index.tsx) into a multi-user, real-time, production-ready system backed by Supabase and TanStack Start.

The specifications in this file are strictly derived from [`plan.md`](plan.md), which serves as the single source of truth for features and behaviors.

---

## 1. System Overview

### 1.1 High-Level Concept
Linara serves as a kitchen-style operating system for domestic households in the Philippines. It models household tasks as "tickets" associated with specific "stations" (Yaya, Cook, Driver, Cleaner, House), where every ticket carries a designated "House Standard" (SOP). 

The platform supports two-sided transparency:
*   **The Manager's Pass:** A read-mostly executive dashboard for on-site and remote OFW family managers.
*   **The Worker's Station:** A focused, high-contrast, task-oriented interface for the helper, displaying a predictable weekly schedule, active ticket execution, private scratchpad notes, and portable financial records (vales, base wage, and accrued rest-owed hours).

### 1.2 Tech Stack
*   **Frontend SPA / SSR Shell:** React 19 inside TanStack Start v1 (powered by Vite 7/8).
*   **Client Routing:** TanStack Router v1 (typed file-based routes generated under `src/routes/`).
*   **Styling & Design Tokens:** Tailwind CSS v4 utilizing custom theme variables (Pine-teal, Sand, Card Cream, Terracotta-gold) declared in [`src/styles.css`](src/styles.css).
*   **UI Components:** shadcn/ui (Radix primitives) found under `src/components/ui/`.
*   **State & Cache Management:** TanStack Query v5 configured in [`src/router.tsx:getRouter()`](src/router.tsx:1) and shared via React context.
*   **Backend & API Layer:** TanStack Start `createServerFn` server functions executed inside Nitro web worker runtimes.
*   **Data, Sync & Auth Provider:** Supabase (PostgreSQL database, Row-Level Security policies, Realtime subscription channels, and GoTrue Auth).
*   **Local Caching:** IndexedDB / LocalStorage for offline-first ticket completion queueing.

---

## 2. Textual Architecture Diagram

The system follows an N-Tier architecture pattern, routing state mutations from client devices through a secure serverless API layer into highly segmented transactional datastores.

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

---

## 3. Frontend Architecture

### 3.1 Component Hierarchy & Role Isolation
The application isolates pages based on the authenticated session's user role.

```
<__root> (HTML & Context Shell)
└── <LinaraApp> (Global Auth Context & simOffsetMs simulator clock)
    ├── <TopBar> (Persona selector, Simulated Clock controller, EOD toggler)
    ├── <AuthScreen> (Login / Claim Code trigger)
    ├── <ManagerView> (Conditional Render: If Role in ['primary', 'co', 'remote'])
    │   ├── <PulseHeader> (Completed ticket counts, Needs You actionable item indicator)
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
    └── <HelperView> (Conditional Render: If Role == 'helper')
        ├── <ClaimAccountFlow> (Invite Code lookup, Terms audit screen, Password creation lock)
        ├── <DignityHeader> (Greeting, Shift-end countdown, Rest-day visual tracker)
        ├── <NextTaskCard> (Single-focus card showing Active task, interactive SOP slides, and Start/Finish actions)
        ├── <QuickUtosFeed> (Floating alert-chips for immediate action items, "Got it/Done" button trigger)
        ├── <PrivateNotesScratchpad> (Helper private text list + offline voice recorder with 'Promote to Board' trigger)
        └── <PayRecordView> (Accrued wages, Current Rest-owed hour counts, SSS/Philhealth/Pag-IBIG compliance logs)
```

### 3.2 State Management & Client-Side Cache
The client utilizes three layers of state management to preserve UI speed:
1.  **TanStack Query Cache:** Caches read operations from database tables (`tickets`, `pantry_items`, `ledger_entries`). Handled via loaders configured in [`src/router.tsx:getRouter()`](src/router.tsx:1).
2.  **`GroceryCtx` (React Context):** Shared local context that synchronizes the active grocery checklist between the Pantry tab (manager side) and the focused Palengke Run task card (helper side).
3.  **Local Sync Queue (IndexedDB):** Stores completed tickets, offline scratchpad notes, and local photo captures when network state is offline (`navigator.onLine === false`). A service worker processes the sync queue automatically once online status transitions.

---

## 4. Backend Architecture

All application APIs are implemented as type-safe TanStack Start server functions using [`createServerFn`](https://tanstack.com/router/v1/docs/guide/server-functions) backed by a Nitro web server engine.

### 4.1 Separation of Concerns
```
  ┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
  │      Route Loader      │      │      Server Fn         │      │      Data Access       │
  │                        │      │                        │      │                        │
  │ Ensures Query Cache is │ ───► │ Enforces Auth, Checks  │ ───► │ Communicates with DB,  │
  │ pre-populated on the   │      │ Regional Batas Rules,  │      │ Returns Normalized     │
  │ Client device.         │      │ Executes transactions. │      │ TypeScript Models.     │
  └────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

### 4.2 Security Boundaries & Privacy Walls
Security is enforced at the database layer using Postgres Row Level Security (RLS). Users cannot execute arbitrary queries across households.
*   **Households Isolation:** Users are tied to a `household_id` in the `user_profiles` table. All operational tables (e.g. `tickets`, `schedules`, `pantry_items`) contain a `household_id` foreign key.
*   **Helper Note Privacy:** The `helper_notes` table is isolated strictly to the helper who authored them. RLS denies any reading or writing of `helper_notes` to users with `manager` or `admin` scopes.
*   **Purge Boundaries:** The nightly Quick Utos purge is executed via a secure system Cron.

---

## 5. External Integration Designs

### 5.1 Supabase Storage Media uploads
*   **Direct Upload Path:** Client initiates upload directly via SDK using pre-signed headers generated by the backend to prevent media proxy bottlenecking.
*   **Content Type Restriction:** Limited strictly to `image/jpeg`, `image/png`, and `audio/webm` (for helper voice notes). Max file size capped at 10MB.
*   **Media Expiry Protocol:** Media files are placed in bucket `household-evidence`. Access requires querying secure short-lived (15 minutes) signed URLs via the SDK:
    ```typescript
    const { data } = await supabase.storage
      .from('household-evidence')
      .createSignedUrl('receipts/rec_0182.jpg', 900);
    ```

### 5.2 Batas Kasambahay Compliance Engine
Integrates regional labor guidelines (Republic Act 10361) into payroll, scheduling, and ledger deductions.
*   ** регіонал (Regional) Minimum Wage Settings:** System updates a read-only table containing legal minimum bases (e.g. NCR: ₱6,000/mo) depending on household coordinates.
*   **Statutory Contribution Matrix:** Automatic ledger generation for SSS, PhilHealth, and Pag-IBIG. Whenever a monthly payslip is generated, the system computes employee/employer contributions:
    *   *If wage < ₱5,000:* Employer covers 100% of contributions (per RA 10361).
    *   *If wage >= ₱5,000:* Split proportional to current SSS/PhilHealth/Pag-IBIG contribution schedules.

### 5.3 Fintech Outbound Payments Pipeline (GCash & Maya)
Provides the data ledger hooks for future Phase 3 instant payouts.
*   Wages and approved vale credits are compiled in the `PayRecordView` component. 
*   A webhook payload schema is established, ready to transmit finalized payouts to Philippine electronic wallets (GCash/Maya) using partner aggregators (e.g. Brankas or PayMongo).

---

## 6. Step-by-Step Data Flow

### 6.1 Helper Invite & Handshake Flow
Detailed sequence for generating and claiming a household connection:

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
Reactive recalculation of tasks anchored to a shifting appointment time:

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
The lifecycles of momentary micro-tasks:

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

#### `POST /api/helpers/invite`
Creates a pending helper seat and generates a unique single-use join code.
*   **Auth Level:** Primary Manager or Co-Manager.
*   **Request Headers:** `Authorization: Bearer <JWT>`
*   **Request Body:**
    ```json
    {
      "name": "Ate Rosa",
      "role": "yaya",
      "monthlyRate": 8500,
      "paydayInterval": "semi_monthly",
      "shiftStart": "06:00",
      "shiftEnd": "18:00",
      "dailyBreakDuration": 120,
      "weeklyRestDay": 0,
      "contactPhone": "+639171234567"
    }
    ```
*   **Response Codes:** `201 Created`, `400 Bad Request`, `401 Unauthorized`.
*   **Response Body:**
    ```json
    {
      "helperId": "hp_001928a",
      "inviteCode": "LN55B1",
      "inviteUrl": "https://linara.ph/claim?code=LN55B1",
      "status": "PENDING_CLAIM"
    }
    ```

#### `GET /api/helpers/claim/verify`
Fetches terms associated with an invitation code for pre-claim audit.
*   **Auth Level:** Unauthenticated.
*   **Query Parameters:** `code=LN55B1`
*   **Response Codes:** `200 OK`, `404 Not Found`.
*   **Response Body:**
    ```json
    {
      "inviteCode": "LN55B1",
      "name": "Ate Rosa",
      "role": "yaya",
      "monthlyRate": 8500,
      "shiftStart": "06:00",
      "shiftEnd": "18:00",
      "weeklyRestDay": 0
    }
    ```

#### `POST /api/helpers/claim`
Finalizes the digital onboarding handshake, converting the invite to a locked auth user.
*   **Auth Level:** Unauthenticated.
*   **Request Body:**
    ```json
    {
      "inviteCode": "LN55B1",
      "email": "rosa.yaya@gmail.com",
      "password": "strong_user_entered_password"
    }
    ```
*   **Response Codes:** `200 OK`, `400 Invalid Code`, `409 Email Conflict`.
*   **Response Body:**
    ```json
    {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "r_0182ha...",
      "userId": "usr_991823",
      "helperId": "hp_001928a"
    }
    ```

---

### 7.2 Ticket Operations

#### `PATCH /api/tickets/:id/status`
Transitions a ticket along its execution pipeline.
*   **Auth Level:** Assigned Helper (or Primary/Co-manager overrides).
*   **Request Body:**
    ```json
    {
      "status": "IN_PROGRESS",
      "timestamp": "2026-07-24T15:00:00Z"
    }
    ```
*   **Response Codes:** `200 OK`, `403 Forbidden` (If helper doesn't own ticket), `404 Not Found`.
*   **Response Body:**
    ```json
    {
      "ticketId": "tk_192",
      "status": "IN_PROGRESS",
      "startedAt": "2026-07-24T15:00:00Z"
    }
    ```

#### `POST /api/tickets/:id/complete`
Uploads verification photographs, processes image properties, and locks task state.
*   **Auth Level:** Assigned Helper.
*   **Content-Type:** `multipart/form-data`
*   **Request Form Fields:**
    *   `photo`: Binary image payload (JPG/PNG).
    *   `notes`: String containing operational update details.
*   **Response Body:**
    ```json
    {
      "ticketId": "tk_192",
      "status": "DONE",
      "photoEvidenceUrl": "https://storage.linara.ph/household-evidence/tk_192_evidence.jpg",
      "ledgerEntryCreated": false
    }
    ```

---

### 7.3 Instant Messaging & System Triggers

#### `POST /api/utos/send`
Submits a quick, transient ask to an on-duty helper.
*   **Auth Level:** Primary Manager, Co-Manager, or Remote Admin.
*   **Request Body:**
    ```json
    {
      "recipientId": "hp_001928a",
      "type": "chip",
      "body": "+ Rice"
    }
    ```
*   **Response Body:**
    ```json
    {
      "utosId": "ut_1120a",
      "status": "SENT",
      "isWaitingOffline": false
    }
    ```

#### `POST /api/system/purge-utos`
Midnight cron executor that aggregates count metrics and wipes Quick Utos rows.
*   **Auth Level:** System Private JWT (Cron daemon authorization).
*   **Request Headers:** `Authorization: Bearer <SYSTEM_CRON_SECRET>`
*   **Response Body:**
    ```json
    {
      "success": true,
      "rowsPurged": 42,
      "timestamp": "2026-07-24T00:00:00Z"
    }
    ```

---

## 8. Data Structures (Normalized Database Schemas)

This database structure outlines the PostgreSQL relational mappings required to build out the operational platform:

### 8.1 Schema Definition SQL

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
    weekly_rest_day INTEGER NOT NULL CHECK (weekly_rest_day BETWEEN 0 AND 6),
    invite_code VARCHAR(6) UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('PENDING_CLAIM', 'ACTIVE', 'INACTIVE')) DEFAULT 'PENDING_CLAIM'
);

-- 3. House SOP Library
CREATE TABLE public.house_sops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    standard_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Tickets Table (Operational tasks, backwards compatible with code status 'todo' | 'in_progress' | 'done' | 'blocked')
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
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES public.user_profiles(id)
);

-- 5. Appointments Table (Schedule Anchors)
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    title TEXT NOT NULL,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    recipe_type TEXT -- Track if event matches a preset template
);

-- 6. After-Hours Ledger
CREATE TABLE public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('overtime', 'rest_break_work', 'rest_day_work', 'emergency')),
    associated_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    duration_minutes INTEGER NOT NULL,
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

-- 10. Quick Utos Table (Temporary storage, fully aligned with TypeScript QuickUtos type)
CREATE TABLE public.quick_utos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_name TEXT NOT NULL, -- display name of admin (e.g. "Sir Ben")
    recipient_id UUID REFERENCES public.helper_profiles(id) NOT NULL,
    content TEXT NOT NULL,
    ack_state TEXT NOT NULL CHECK (ack_state IN ('sent', 'seen', 'done')) DEFAULT 'sent',
    after_hours BOOLEAN NOT NULL DEFAULT FALSE,
    emergency BOOLEAN NOT NULL DEFAULT FALSE,
    waiting BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 11. Helper Private Notes (Protected by strict RLS, aligned with MyNote type)
CREATE TABLE public.helper_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    voice TEXT, -- URL or pointer to recorded voice note snippet
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

---

## 9. State and Context Handling

To represent state in the system without relying on client-side state locks, Linara implements a highly specific routing synchronization design:

### 9.1 The Simulated Clock (`simOffsetMs`)
The dashboard implements an internal global timezone/simulated clock state:
```typescript
interface ClockState {
  simOffsetMs: number; // millisecond difference between browser clock and simulated clock
  getCurrentTime: () => Date; // Computes adjusted Date: new Date(Date.now() + simOffsetMs)
}
```
All shift boundaries, automatic clock-out triggers, quiet-hours calculations, and midnight database purges are computed relative to `getCurrentTime()`.

### 9.2 The Grocery State Context
To link the Pantry component and the Palengke Run card, the React `GroceryCtx` holds two active arrays:
*   `pantryAutoSuggestions`: An array derived dynamically on loading by identifying any item in `pantry_items` where `qty <= par`.
*   `manualGroceryItems`: Hardcoded lines recorded directly onto the grocery checklist.
When a helper initiates a Palengke Run task, the client merges these lists into a single actionable checklist. Marking an item as bought and inputting actual cost executes a database transaction:
1.  Sets `bought` to `true` on the `grocery_items` table.
2.  Increments `qty` on the corresponding `pantry_items` table row to its configured `par` target.

---

## 10. Error Handling Strategy

### 10.1 Authentication & Credential Anomalies
*   **Invalid JWT / Expired Sessions:** The client application implements an axios/Supabase interceptor. When a REST transaction throws `401 Unauthorized`, the client intercepts the thread, queries GoTrue's Token Refresh endpoint, and transparently retries the query. If the refresh fails, client-side state is purged and the user is redirected cleanly to `<AuthScreen />` with an overlay notice: `"Session expired. Please log in again."`
*   **Mismatch Onboarding Flags:** If the helper audits their employment invite and finds incorrect wage figures, they tap `"Something's not right?"`. The claim is suspended, a flag is added to the `InviteFlags` table, and the manager is alerted in `<NeedsYou />`. The onboarding claims process is frozen until the manager acknowledges the change or updates the base rates.

### 10.2 Invalid & Empty API Responses
*   **No Reachable Helpers (Emergency Overrides):** If a manager initiates an urgent Quick Uto or Task while all helpers are `Off`, the system intercepts the request. It returns a specific constraint error payload:
    ```json
    {
      "error": "RECIPIENT_UNAVAILABLE",
      "message": "No helper is currently active or Available. Sending this pings off-hours.",
      "accrualRate": "30m"
    }
    ```
    The UI catches this, renders the modal warning prompt, and forces the manager to click "Override" to reissue the command with parameter `override_off_hours = true`.
*   **Media Upload Faults:** If image uploads during a ticket completion fail due to poor connectivity, the IndexedDB queue halts the completion state transition, preserves the local photo blob, and periodically retries the API call.

---

## 11. Local Deployment Model

To deploy the application inside a local development environment, the following configuration parameters are required:

### 11.1 Local Environment Variables (`.env`)
Create a file named `.env` in the root workspace directory containing:

```env
# 1. Supabase Local Engine Coordinates (Run via Supabase CLI)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsLWVudmlyb25tZW50Ii...

# 2. Server Runtime Credentials
JWT_SECRET=super_secret_local_dev_jwt_key_string_32_chars
SYSTEM_CRON_SECRET=local_cron_purger_verification_hash_192837

# 3. regional labor parameter configuration
REGIONAL_MINIMUM_WAGE=6000.00
```

### 11.2 Run & Verification Procedures
1.  **Install Bun Dependencies:**
    Ensure Bun package manager is active, and install standard package dependencies:
    ```bash
    bun install
    ```
2.  **Initialize Database Schema:**
    Apply the normalization SQL declarations (detailed in Section 8) directly to the local PostgreSQL server or through the Supabase Dashboard CLI.
3.  **Boot Development Server:**
    Run the local Vite server using:
    ```bash
    bun dev
    ```
    The application will bind to `http://localhost:8080`. Connect multiple browser tabs with different view personas (e.g. `Sir Ben` on tab 1, `Ate Rosa` on tab 2) to test real-time ticket handshakes, off-hours ledgers, and inventory counters.
