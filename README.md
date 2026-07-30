# Linara Home — Kitchen-Style Operating System for the Filipino Household

Linara (app) / Linara Home (product & entity) is a comprehensive kitchen-style operating system designed specifically for coordinating modern Filipino households. Inspired by professional kitchen passes and station structures, Linara aligns family managers and household staff (kasambahay, yaya, cook, driver, all-around) on clear terms of work, schedules, compensation, and rest, ensuring dignity by design and high operational clarity.

For deeper project specifications and technical layouts, please refer to the following background documentation:
- Product Requirements: [plan.md](plan.md)
- Technical Blueprint: [architecture.md](architecture.md)
- Conceptual Foundations: [home-management-concept.md](home-management-concept.md)
- Design Tokens: [src/styles.css](src/styles.css)

---

## 1. High-Level Vision & Objectives

Informal domestic work in the Philippines often lacks systematic recording. Traditional management relying heavily on raw messaging (Viber, SMS, Messenger) leads to high turnover, communication friction, and a lack of verifiable work history for helpers. 

Linara addresses these challenges by modeling the home like a professional kitchen:
* **Clarity over Control:** Household tasks are represented as structured tickets with associated "House Standards" (Standard Operating Procedures - SOPs).
* **Dignity by Design:** Helpers are first-class users who own their personal accounts, login details, and completed task history. This portable record can be carried to future employers.
* **Filipino-First Realities:** Built-in support for Batas Kasambahay guidelines, vales (salary advances), 13th-month accruals, palengke (wet market) budgets, live-in/live-out shift rest boundaries, and Taglish communication chips.
* **OFW Presence:** Remote managers (e.g., Overseas Filipino Workers) can monitor home operations and manage payroll from abroad without micro-managing or invading helper privacy.

---

## 2. User Roles & Permissions

Linara coordinates three key administrative stakeholders and the household staff with strict boundaries:

| Power / Action | Primary Manager (On-Site) | Co-Manager (On-Site) | Remote Admin (OFW) | Helper (Kasambahay) |
| :--- | :--- | :--- | :--- | :--- |
| **Manage Admins & Helpers** | Yes | No | No | No |
| **Edit Schedules & Rest Days** | Yes | Yes | View-Only | View-Only |
| **Assign / Approve Tickets** | Yes (Live) | Yes (Live) | Suggested by Default | View-Only / Claimable |
| **Approve Vales & Budgets** | Yes | Yes | Yes (Funding Source) | No |
| **Override Helper Off-Hours** | Yes (With logged friction) | Yes (With logged friction) | No | N/A |
| **View Money & Pay Ledger** | Yes | Yes | Yes | Yes (Own Record Only) |
| **Access "My Notes"** | No | No | No | Yes (Private to Helper) |

---

## 3. Five Core Operational Workflows

### 3.1 Onboarding and Account Handshake
To prevent employers from controlling helper credentials, onboarding uses a strict digital handshake.
1. **Terms Setup:** The Primary Manager inputs the worker's parameters (Role, Base Wage, Shift Start/End, Weekly Rest Day) in the app.
2. **Invitation Code:** The system generates a single-use 6-digit alphanumeric `Invitation Code` (e.g., `LN98A2`).
3. **Helper Claim:** The helper logs into the Linara App on their device, enters the code, reviews the read-only summary of the terms, and sets their personal password.
4. **Ownership:** The employer has no access to the helper's credentials. If the helper leaves the household, their account and verified payslips remain their personal property.

### 3.2 Anchor-Based Appointment Tasks
Appointments act as schedule anchors, generating preparation tasks that fire backward in time.
* **Anchor Setup:** A manager adds an Appointment: `"Sir's Flight"` on Friday at 6:00 AM using an event recipe template.
* **Lead Time Calculations:** The recipe dictates dependent tasks:
  - `Pack bags` (Lead time: `-10 hours` -> Thursday at 8:00 PM)
  - `Prepare baon` (Lead time: `-2 hours` -> Friday at 4:00 AM)
  - `Wake driver & load car` (Lead time: `-45 minutes` -> Friday at 5:15 AM)
* **Rescheduling Propagation:** If Sir's flight is delayed to Friday at 9:00 AM, the manager shifts the appointment. The system automatically recalculates and shifts all dependent tasks, notifying the helper of the new times without silent schedule changes.

### 3.3 Quick Utos & Nightly Purge
Handles trivial, short-order requests (e.g., "Add more rice," "Come to kitchen") without bloating formal task boards or creating open-ended chat rooms.
* **Lightweight Delivery:** Managers tap "Quick Uto" and choose a quick-chip, text, or a short 15-second voice snippet.
* **Shift Awareness:** Held in queue if the helper is `Off-Shift`; sent live if the helper is `On-Shift`.
* **One-Tap Acknowledgment:** Appears on the helper's station as a floating chip with a single `"Got it"` or `"Done"` action button.
* **Midnight Purge:** To prevent performance scoring or historical over-scrutiny, all individual Quick Utos are permanently deleted from the database at midnight. The system increments an aggregated daily count showing the manager a gentle mirror (`"You sent 12 small asks today"`), then resets the counter.

### 3.4 After-Hours Escalation & Ledger Accrual
Protects live-in helpers' rest boundaries while allowing managers to handle critical emergencies.
* **Friction Wall:** Sending a task or Quick Uto to an off-shift helper triggers a warning block: `"Rosa is currently Off-Shift. Proceeding will log 30 mins of Rest Owed."`
* **Emergency Override:** If the manager overrides, the helper receives a high-priority alert.
* **Time-Off in Lieu:** Once marked done, the system logs the exact duration (minimum 30 minutes) on the `After-Hours Ledger`, incrementing `"Rest Owed"` hours. Both the manager's and helper's dashboards update in real-time.

### 3.5 Pantry-to-Palengke Reconciliation
Ties kitchen inventory levels to shopping runs, cash spend, and budget tracking.
1. **Low Stock Detection:** The cook updates the pantry: `Rice` falls to `2kg` (below its `10kg` Par Level).
2. **Auto-Shopping Checklist:** The next "Palengke Run" task automatically includes `Rice: 8kg needed` along with a designated cash budget (e.g., `₱1,500`).
3. **Cost & Receipt Capture:** The helper purchases the items, enters actual costs (e.g., `Rice: ₱480`), takes a photo of the receipt, and clicks complete.
4. **Reconciliation:** The manager's dashboard spend dial live-updates (₱1,120 spent, ₱380 remaining) and displays the uploaded receipt image.

---

## 4. Technical Architecture

Linara is structured as an N-Tier architecture designed to handle unreliable network states and maintain high-fidelity separation of concerns:

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

### 4.1 Tech Stack Components
- **Frontend SPA / SSR Shell:** React 19 / TanStack Start v1 (Vite-powered).
- **Routing:** TanStack Router v1 (fully typed, file-based routes in `src/routes/`).
- **Styling:** Tailwind CSS v4 featuring professional, warm design tokens (Teal, Sand, Cream, Terracotta) inside `src/styles.css`.
- **Database & Auth:** Supabase PostgreSQL with strict Row-Level Security (RLS) policies and GoTrue Auth.
- **Client Cache:** TanStack Query v5 + IndexedDB / LocalStorage queue for offline-first support.
- **APIs:** Type-safe Server Functions (`createServerFn`).

---

## 5. Normalized Database Schema

Linara runs on a highly structured PostgreSQL database schema to enforce isolation between household entities and protect helper privacy:

### 5.1 Tables Map

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

-- 4. Tickets Table (Operational tasks, backward compatible with statuses: 'todo', 'in_progress', 'done', 'blocked')
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

-- 11. Helper Private Notes (Protected by strict RLS)
CREATE TABLE public.helper_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID REFERENCES public.helper_profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    voice TEXT, -- URL or pointer to recorded voice note snippet
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

### 5.2 Row-Level Security & Helper Privacy Wall
The application utilizes Row-Level Security (RLS) on Postgres tables to ensure maximum data isolation:
* **Household Security:** All primary data tables have a `household_id` UUID column. RLS queries ensure that users can only fetch or mutate rows associated with their authenticated profile's `household_id`.
* **Helper Note Isolation:** The `helper_notes` table strictly prevents managers or system administrators from querying or viewing records. Only the helper who authored the notes has query rights:
```sql
ALTER TABLE helper_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY helper_notes_privacy ON helper_notes 
  USING (auth.uid() = user_id);
```

---

## 6. Local Development & Setup

Follow these steps to set up and run the Linara application locally:

### 6.1 Prerequisites
- [Bun runtime](https://bun.sh/) (v1.1+ recommended)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (or access to a running Postgres database instance)

### 6.2 Installation Steps

1. **Clone the Repository:**
   ```bash
   git clone <repository-url>
   cd LINARA
   ```

2. **Install Dependencies:**
   Use Bun to install required libraries and setup packages:
   ```bash
   bun install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory. You can copy the template from `.env.sample`:
   ```bash
   cp .env.sample .env
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

4. **Initialize Database Schema:**
   Apply the normalization SQL setup definitions (specified in Section 5) to your local PostgreSQL instance or configure them via the Supabase Dashboard SQL Editor.

5. **Start Development Server:**
   Run the local Vite web worker environment:
   ```bash
   bun dev
   ```
   The application will bind to `http://localhost:8080`.

---

## 7. Operational Testing & Personas Sim

To test real-time features and boundaries during development:
1. Open **Tab 1** in your browser and log in as a **Primary Manager** persona (e.g. *Sir Ben*).
2. Open **Tab 2** (or use an Incognito window) and log in as a **Helper** persona (e.g. *Ate Rosa*).
3. Use the integrated **Simulated Clock Controller** (`simOffsetMs` dynamic header clock) to jump forward/backward in time to trigger off-shift alerts, task transitions, nightly purges, and after-hours overtime compensation approvals.
