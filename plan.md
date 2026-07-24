# Linara Home — Product Requirements Document (PRD)

This document defines the complete, implementation-ready product specifications for **Linara** (app) / **Linara Home** (product & entity), a kitchen-style operating system for the Filipino household. It aligns family managers and household staff (kasambahay, yaya, cook, driver, all-around) on clear terms of work, schedule, pay, and rest, ensuring dignity by design and high operational clarity.

Reference Document: [`home-management-concept.md`](home-management-concept.md)

---

## 1. High-Level System Goals & Context

### 1.1 Objective & Vision
The informal domestic work sector in the Philippines lacks systematic documentation. Contracts, task definitions, schedules, and financial records (such as vales, 13th-month accruals, and rest days) are rarely recorded. This creates friction, ambiguity, and overwork on one side, and frustration or high turnover on the other.

**Linara** resolves this by operating as a "restaurant management system for the home":
*   **Clarity over Control:** Tasks are tickets with clear "House Standards" (Standard Operating Procedures - SOPs).
*   **Dignity by Design:** The helper is a first-class user who owns their account and can carry their verified history to future employers.
*   **Filipino-First Realities:** Native support for Batas Kasambahay guidelines, vales (salary advances), 13th-month calculations, palengke (wet market) budgets, live-in/live-out rest boundaries, and Taglish communication.
*   **Presence for Distant Family:** An Overseas Filipino Worker (OFW) parent can see the household run and manage payroll from abroad without micro-managing or breaching helper boundaries.

### 1.2 User Roles & Permissions
The system coordinates three key actors with distinct permission boundaries:

| Permission / Power | Primary Manager (On-Site) | Co-Manager (On-Site) | Remote Admin (OFW) | Helper (Kasambahay) |
| :--- | :--- | :--- | :--- | :--- |
| **Manage Admins & Helpers** | Yes | No | No | No |
| **Edit Schedules & Rest Days** | Yes | Yes | View-Only | View-Only |
| **Assign / Approve Tickets** | Yes (Live) | Yes (Live) | Suggested by default, Live on urgent override | View-Only / Claimable |
| **Approve Vales & Budgets** | Yes | Yes | Yes (Usually funding source) | No |
| **Override Helper Off-Hours** | Yes (With logged friction) | Yes (With logged friction) | No | N/A |
| **View Money & Pay Ledger** | Yes | Yes | Yes | Yes (Own record only) |
| **Access "My Notes"** | No | No | No | Yes (Private to Helper) |

---

## 2. Step-by-Step User Flows

### 2.1 Onboarding and Account Handshake Flow
To prevent employers from controlling helper credentials, onboarding is a strict digital handshake.

```
[Primary Manager]                                            [Helper (Ate Rosa)]
       │                                                              │
       ├─► 1. Enters helper profile, wage, shift, rest days           │
       ├─► 2. Generates secure Invitation Code                        │
       │                                                              │
       │      ─── (Shared via SMS, Viber, or Printout) ───►           │
       │                                                              │
       │                                                              ├─► 3. Enters code in Linara App
       │                                                              ├─► 4. Reviews terms (wage, rest day, hours)
       │                                                              ├─► 5. Sets personal password & login details
       │                                                              ├─► 6. Locks handshake & enters Station
       ▼                                                              ▼
```

1.  **Employer Invitation:** The Primary Manager inputs the worker's details (Name, Station/Role, Base Wage, Shift Start/End, Weekly Rest Day, and Contact). The system generates a single-use 6-digit `Invitation Code` and a signup link.
2.  **Helper Review & Claim:** The helper downloads the app (or accesses the web app) and enters the `Invitation Code`. The helper sees a clear, read-only summary of the terms entered by the employer (Transparency View). 
3.  **Account Creation:** If terms match their verbal agreement, the helper inputs their own secure password and locks the account. If terms are incorrect, they can flag them before claiming.
4.  **Ownership:** The employer has no access to the helper's password. If the helper leaves the household, their account, completed task history, and verified payslips remain their personal property (Portable Record).

### 2.2 Anchor-Based Appointment Task Flow
This implements the "star mechanic" where appointments act as schedule anchors, generating preparation tasks that fire backward in time.

```
       [Appointment Anchor Created]
       "Sir's Flight: Friday 6:00 AM"
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
   -10 Hours     -2 Hours     -45 Mins
   [Pack Bags] [Prep Baon] [Wake Driver]
   (Thu 8:00PM) (Fri 4:00AM) (Fri 5:15AM)
```

1.  **Anchor Setup:** A manager adds an Appointment: `"Sir's Flight" on Friday at 6:00 AM` using the `Airport Departure` event recipe.
2.  **Backward Computation:** The recipe dictates three prep tasks:
    *   `Pack bags` (Lead time: `-10 hours` -> schedules automatically for Thursday at 8:00 PM).
    *   `Prepare baon` (Lead time: `-2 hours` -> schedules automatically for Friday at 4:00 AM).
    *   `Wake driver & load car` (Lead time: `-45 minutes` -> schedules automatically for Friday at 5:15 AM).
3.  **Rescheduling Propagation:** Sir's flight is delayed to Friday at 9:00 AM. The manager edits the appointment time.
4.  **Task Recalculation:** The system automatically shifts dependent tasks:
    *   `Pack bags` shifts to Thursday 11:00 PM.
    *   `Prepare baon` shifts to Friday 7:00 AM.
    *   `Wake driver` shifts to Friday 8:15 AM.
5.  **Helper Notification:** Instead of silent shifts, the assigned helper's station highlights: `"Sir's Flight moved to 9:00 AM. Your Pack Bags task is now scheduled for Thursday 11:00 PM."`

### 2.3 Quick Utos & Nightly Purge Flow
This handles trivial, short-order requests (e.g., "Add more rice," "Come to kitchen") without the bloat of formal task cards or the always-on "leash" of open chat.

1.  **Composition:** On the Pass, the Manager taps "Quick Uto" and either:
    *   Selects a quick-chip (e.g., `+ Rice`, `Water`, `Front Door`).
    *   Types a single line of text.
    *   Holds to record a short (max 15-second) voice snippet.
2.  **Availability Filter:** The system checks the helper's status. If the helper is `Off`, the system holds the uto in a queue. If `On Shift` or `Available`, the uto is sent live.
3.  **Helper Station Display:** The uto appears at the bottom of the helper's screen as a lightweight, floating colored chip with a single `"Got it"` or `"Done"` action button.
4.  **No Back-and-Forth:** Once tapped, the manager's screen updates to "Done." There is no typing capability for the helper to prevent open-ended chat rooms.
5.  **Nightly Wipe:** At midnight, all individual Quick Utos and voice notes are permanently deleted from the database. The system increments a temporary counter of total daily asks to show a gentle mirror to the manager (`"You sent N small asks today"`), then resets the counter to zero. No historical archive of specific utos is retained to prevent performance scoring or scrutiny.

### 2.4 After-Hours Escalation & Ledger Accrual Flow
Enforces rest boundaries for live-in helpers while accommodating real-world emergencies.

1.  **Trigger Event:** A manager attempts to send a task or Quick Uto to a helper who is currently `Off` (either because they are out of shift hours, on a break, or on their weekly rest day).
2.  **Friction Wall Encounter:** The system blocks immediate sending and displays a modal:
    *   *If normal off-shift:* `"Rosa is currently Off-Shift. Sending this now will disturb her rest and log 30 mins of Rest Owed to her ledger. Proceed?"`
    *   *If overnight hard-off (10 PM - 6 AM) or Rest Day:* `"Rosa is on overnight rest / her Rest Day. Reaching her requires emergency override. This will be logged on the ledger. Proceed?"`
3.  **Escalation / Override:** The manager taps "Override & Send."
4.  **Helper Reception:** The helper receives an high-priority alert.
5.  **Completion & Ledgering:** Once the helper marks the task as done, the system computes the exact duration (from assignment/start to completion, defaulting to a minimum of 30 minutes) and pushes an entry to the After-Hours Ledger.
6.  **Accrual:** The ledger increments `"Rest Owed"` (Time-Off in Lieu) in hours/minutes. Both the Manager's Money tab and the Helper's My Pay tab update instantly to reflect identical, transparent balances (e.g., `Rest Owed: 1h 30m`).

### 2.5 Pantry-to-Palengke Reconciliation Flow
Ties kitchen inventory to shopping runs, cash spend, and budget tracking.

```
 [Pantry Item: Rice]
 Current: 2kg | Par: 10kg
         │
         ▼ (Below Par)
 [Auto-Generated Shopping List]
 Add "Rice (8kg)" to Palengke Run
         │
         ▼ (Task Assigned)
 [Helper Purchases Rice]
 Enters: Cost (₱480) & Uploads Receipt Image
         │
         ▼ (Reconciliation)
 [Manager Pass Updates]
 Spend Dial reduces by ₱480 | Receipt archived
```

1.  **Low Stock Detection:** The cook updates the Pantry: `Rice` is at `2kg` (Par Level is `10kg`). The item flags as "Low."
2.  **Auto-List Generation:** The system auto-populates the next "Palengke Run" task checklist with `Rice: 8kg needed`.
3.  **Shopping Execution:** The helper takes the assigned Palengke Run task. The app displays the checklist with explicit target quantities and a designated "Petty Cash Budget" (e.g., `₱1,500`).
4.  **Spend Entry:** For each item purchased, the helper inputs the actual cost (e.g., `Rice: ₱480`). 
5.  **Receipt Upload:** Before completing the run, the helper takes a photo of the paper receipt and taps "Complete."
6.  **Manager Reconciliation:** The Pass "Spend Dial" live-updates to show the cash reduction (₱1,500 budget -> ₱1,120 spent -> ₱380 remaining). The Primary Manager views the uploaded receipt image directly on the Done card for a calm, silent record of expenditures.

---

## 3. Precise Inputs & Outputs (Data Schemas & APIs)

To ensure implementation readiness, the data structures and boundary expectations for core operations are defined below.

### 3.1 Helper Invitation & Account Claiming

#### Data Model: `HelperProfile`
```typescript
interface HelperProfile {
  id: string;
  name: string;
  role: 'yaya' | 'cook' | 'driver' | 'cleaner' | 'all_around';
  status: 'PENDING_CLAIM' | 'ACTIVE' | 'INACTIVE';
  wageDetails: {
    monthlyRate: number; // in PHP
    paydayInterval: 'semi_monthly' | 'monthly';
    sssContributions: boolean;
    philhealthContributions: boolean;
    pagibigContributions: boolean;
  };
  schedule: {
    shiftStart: string; // HH:MM
    shiftEnd: string;   // HH:MM
    dailyBreakDuration: number; // in minutes
    weeklyRestDay: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0, etc.
  };
  inviteCode: string | null; // 6-digit alphanumeric
  userId: string | null; // References claimed User account
}
```

#### API: Initiate Helper Invite
*   **Path:** `POST /api/helpers/invite`
*   **Input (Manager Role Auth):**
    ```json
    {
      "name": "Maria Rosa",
      "role": "cook",
      "monthlyRate": 8000,
      "paydayInterval": "semi_monthly",
      "shiftStart": "06:00",
      "shiftEnd": "18:00",
      "dailyBreakDuration": 120,
      "weeklyRestDay": 0
    }
    ```
*   **Output:**
    ```json
    {
      "helperId": "hp_981273",
      "inviteCode": "LN98A2",
      "inviteUrl": "https://linara.ph/claim?code=LN98A2",
      "status": "PENDING_CLAIM"
    }
    ```

#### API: Claim Helper Invite
*   **Path:** `POST /api/helpers/claim`
*   **Input (Unauthenticated):**
    ```json
    {
      "inviteCode": "LN98A2",
      "email": "rosa.maria@gmail.com",
      "password": "hashed_password_string_here"
    }
    ```
*   **Output:**
    ```json
    {
      "accessToken": "jwt_token_here",
      "helperId": "hp_981273",
      "termsAccepted": true
    }
    ```

### 3.2 Ticket State Transitions (Start -> Do -> Done with Photo)

#### Data Model: `Ticket`
```typescript
interface Ticket {
  id: string;
  title: string;
  stationId: string; // links to HelperProfile
  assignedTo: string; // Helper userId
  sopId: string | null; // links to House Standard / SOP
  status: 'QUEUED' | 'OFFERED' | 'ACTIVE' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'CANCELLED';
  timeContext: {
    scheduledStart: string; // ISO 8601
    actualStart: string | null;
    actualEnd: string | null;
  };
  photoEvidenceUrl: string | null;
  isAfterHours: boolean;
  notes: string | null;
}
```

#### API: Update Ticket Status
*   **Path:** `PATCH /api/tickets/:id/status`
*   **Input (Helper Auth):**
    ```json
    {
      "status": "IN_PROGRESS",
      "timestamp": "2026-07-24T18:05:00Z"
    }
    ```
*   **Output:**
    ```json
    {
      "ticketId": "tk_55021",
      "currentStatus": "IN_PROGRESS",
      "activeSince": "2026-07-24T18:05:00Z"
    }
    ```

#### API: Complete Ticket with Photo Evidence
*   **Path:** `POST /api/tickets/:id/complete`
*   **Input (Helper Auth):** Multipart Form Data containing:
    *   `photo`: Image Binary (JPEG/PNG)
    *   `notes`: String (optional)
    *   `timestamp`: "2026-07-24T18:30:00Z"
*   **Output:**
    ```json
    {
      "ticketId": "tk_55021",
      "status": "DONE",
      "photoEvidenceUrl": "https://storage.linara.ph/evidence/tk_55021_done.jpg",
      "ledgerEntryCreated": false
    }
    ```

### 3.3 Quick Utos Creation, Acknowledgment, and Nightly Purge

#### Data Model: `QuickUto`
```typescript
interface QuickUto {
  id: string;
  senderId: string; // Admin userId
  recipientId: string; // Helper userId
  content: {
    type: 'text' | 'chip' | 'voice';
    body: string; // text body or CDN URL to voice note
  };
  acknowledged: boolean;
  createdAt: string; // ISO 8601
}
```

#### API: Send Quick Uto
*   **Path:** `POST /api/utos/send`
*   **Input (Admin Auth):**
    ```json
    {
      "recipientId": "hp_981273",
      "type": "chip",
      "body": "+ Rice"
    }
    ```
*   **Output:**
    ```json
    {
      "utoId": "ut_00192a",
      "status": "SENT",
      "timestamp": "2026-07-24T19:30:00Z"
    }
    ```

#### API: Acknowledge Quick Uto
*   **Path:** `POST /api/utos/:id/ack`
*   **Input (Helper Auth):**
    ```json
    {}
    ```
*   **Output:**
    ```json
    {
      "utoId": "ut_00192a",
      "acknowledged": true,
      "timestamp": "2026-07-24T19:32:00Z"
    }
    ```

#### API: Nightly Purge (Cron-Triggered System Endpoint)
*   **Path:** `POST /api/system/purge-utos` (Secured via secret token)
*   **Action:** Deletes all rows from `QuickUto` table. Writes aggregated metrics count to `DailyAuditMirror` (without identifying details).
*   **Database Query Equivalent:**
    ```sql
    DELETE FROM quick_utos WHERE created_at < NOW() - INTERVAL '1 day';
    ```

### 3.4 After-Hours Ledger Entry Creation

#### Data Model: `LedgerEntry`
```typescript
interface LedgerEntry {
  id: string;
  helperId: string;
  sourceType: 'overtime' | 'rest_break_work' | 'rest_day_work' | 'emergency';
  associatedTicketId: string | null;
  durationMinutes: number;
  resolved: boolean;
  resolvedAt: string | null;
  resolutionType: 'rest_owed' | 'premium_pay' | null;
  createdAt: string;
}
```

---

## 4. Detailed Interface & Dashboard Structure

### 4.1 Manager's Pass (Web/Mobile App Dashboard)
Designed as a read-mostly "Pass view" for immediate home evaluation.

```
┌────────────────────────────────────────────────────────────────────────┐
│  LINARA  [Home, made clear]                    [🔔] [Profile (Manager)]│
├────────────────────────────────────────────────────────────────────────┤
│  PULSE: 6 of 9 Completed  ·  2 In Progress  ·  [ 1 Needs You ]         │
├────────────────────────────────────────────────────────────────────────┤
│  [ THE LINE VIEW ]  (Switch to Board View)                             │
│                                                                        │
│  STATION: YAYA (Rosa) [On-Shift]                                      │
│  [ Doing ] Feed Sofia (3 PM - 4 PM) [Standard: 4oz warm, level scoop]   │
│  [ Todo  ] Fold Clothes (4:30 PM)                                      │
│                                                                        │
│  STATION: COOK (Elena) [Off - On Break]                                │
│  [ Done  ] Palengke Run (10 AM) ── [👁️ View Receipt & Photo Done]     │
│  [ Todo  ] Prep Dinner (5:00 PM)                                       │
│                                                                        │
│  STATION: DRIVER (Jun) [Off - Shift Over]                              │
│  [ Done  ] School Dropoff (2:30 PM)                                    │
├────────────────────────────────────────────────────────────────────────┤
│  DIALS:                                                                │
│  ┌─────────────────────────┐          ┌─────────────────────────────┐  │
│  │   PETTY CASH BUDGET     │          │        NEXT PAYDAY          │  │
│  │   ₱1,120 / ₱1,500 spent │          │   August 15 (Semi-Monthly)  │  │
│  │   [=======>      ] 74%  │          │   Accrued Rest Owed: 2h 15m │  │
│  └─────────────────────────┘          └─────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

#### Key Layout Fields:
1.  **Header:** Displays logo, active notifications (e.g., helper requesting a vale, task blocked), and profile switcher.
2.  **The Pulse Line:** Single high-contrast status bar. Highlighted block if manual intervention is required.
3.  **Active Board Toggle:** Toggle buttons to switch between **The Line** (organized horizontally or vertically by helper/station) and **The Board** (classic Kanban: To Do, Doing, Done).
4.  **Helper Lanes:** Displays cards representing assigned tickets for the current shift. Completed cards showcase thumbnail evidence pictures.
5.  **Dials Section:**
    *   **Spend Dial:** Visual progress bar tracking petty cash spent against the monthly or weekly allocation.
    *   **Pay Dial:** Calculates upcoming base wage, pending vale deductions, and accrued after-hours Rest Owed.

### 4.2 Worker's Station (Mobile Interface)
Optimized for high-contrast viewing, large hit targets, Taglish support, and clear physical boundaries.

```
┌────────────────────────────────────────────────────────┐
│  Ate Rosa                                       [☀️ On] │
│  Shift ends: 6:00 PM (Rest Day: Sunday)                │
├────────────────────────────────────────────────────────┤
│  CURRENT TICKET:                                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │  👶 FEED SOFIA (3:00 PM)                         │  │
│  │                                                  │  │
│  │  HOUSE STANDARD:                                 │  │
│  │  * Use 4oz warm water                            │  │
│  │  * Add exactly 2 level scoops of formula         │  │
│  │  * Check temperature on wrist                    │  │
│  │                                                  │  │
│  │  [👁️ VIEW STANDARD PHOTO]                        │  │
│  │                                                  │  │
│  │  [ ▶️ START WORK ]                                 │  │
│  └──────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────┤
│  QUICK UTOS:                                           │
│  ┌────────────────────────┐  ┌──────────────────────┐  │
│  │  💬 "+ Rice" from Ma'm  │  │  🔊 [▶] Voice Note   │  │
│  │  [ Got it / Tapos ]    │  │  [ Got it / Tapos ]  │  │
│  └────────────────────────┘  └──────────────────────┘  │
├────────────────────────────────────────────────────────┤
│  [ MY NOTES (Private) ]                                │
│  * Buy baking powder next market run                   │
│  [✏️ Add Note]                                         │
├────────────────────────────────────────────────────────┤
│  [ 💵 MY PAY · MY RECORD ]                             │
│  August 15 Accrued: ₱4,000 | Rest Owed Balance: 2h 15m │
└────────────────────────────────────────────────────────┘
```

#### Key Layout Fields:
1.  **Dignity Header:** Dedicated to the worker. Displays their name, current shift boundary status, and a highlighted countdown to their next weekly Rest Day.
2.  **Active Focus Card:** One large, card interface detailing the task immediately at hand. Houses the "House Standard" checklist and a single major action button.
3.  **Quick Utos Area:** Compact, touch-friendly modules showing momentary messages. Tapping "Got it" removes the item immediately.
4.  **My Notes Section:** Simple, completely private text scratchpad. Fully isolated from manager queries.
5.  **My Pay Tab:** Bottom section presenting transparent payroll info: accumulated wages, active vale balance, and rest-owed.

---

## 5. Explicit Integrations & Security Boundaries

### 5.1 Cloud Storage & Photo Processing
*   **Service Provider:** Supabase Storage / AWS S3 buckets.
*   **Use Cases:**
    *   **Ticket Evidence:** Photos taken upon ticket completion. Compressed client-side (maximum 1200px width) before upload to save helper data charges.
    *   **Receipt Capture:** Retail receipt photos taken during Palengke runs.
    *   **Standard Library Images:** SOP reference photographs.
*   **Security Protocol:** Private URLs signed with a 15-minute expiration window to prevent leaks of household privacy.

### 5.2 Helper Notes Data Privacy Isolation (The Privacy Wall)
*   Helper's "My Notes" text data must reside strictly in local SQLite / PostgreSQL storage utilizing row-level security (RLS) policies.
*   The API database schema isolates notes by ownership:
    ```sql
    ALTER TABLE helper_notes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY helper_notes_privacy ON helper_notes 
      USING (auth.uid() = user_id);
    ```
*   This ensures that even if a system administrator is queried, or the manager makes a raw API request, helper-private notes are structurally shielded.

### 5.3 Batas Kasambahay Compliance Engine
*   **Legal Reference:** RA 10361 (Batas Kasambahay).
*   **Configuration Settings (Managed in DB or Config file):**
    *   `MINIMUM_MONTHLY_WAGE`: Configurable by region (e.g., NCR: ₱6,000).
    *   `MANDATORY_REST_DAYS`: Minimum 1 day (24 hours) per week.
    *   `13TH_MONTH_PAY`: Automatic monthly accrual calculator: `(Base Monthly Wage / 12) * Months Worked`.
    *   `REST_DAY_WORK_PREMIUM`: Configurable multiplier (usually 1.3x daily equivalent rate or accrual of equivalent rest hours).

### 5.4 Offline-First Support & Local Storage
*   Since Filipino domestic workers may have intermittent mobile coverage (e.g., inside concrete house walls, inside wet markets), the client-side app utilizes offline-first caching via IndexedDB or LocalStorage.
*   Completed tasks and photo evidence are queued locally and automatically uploaded when network connectivity resumes, preventing data loss or accidental "no-work" records.

---

## 6. MVP Roadmap & Feature Gates

To maintain a highly simplified MVP scope, features are sequenced into phases:

*   **Phase 1 (MVP Baseline):** Single Household, One-to-One Manager & Helper pairing, Core Pass & Station UI, Standard Library, Scheduled Calendar, Local-storage private Notes, Simple After-Hours Ledger (Accruing hours/minutes manually).
*   **Phase 2 (Growth & Compliance):** Multi-Helper routing with coverage warnings, Automated "Anchor" task calculations, Interactive Quick Utos with nightly purge, Automatic regional Batas Kasambahay minimum warnings, and PDF payslip exporter.
*   **Phase 3 (Fintech & Scale):** One-click payroll disbursement via GCash/Maya API integrations, OFW-direct remittance, micro-insurance claims, and worker proof-of-income loan underwriting.
