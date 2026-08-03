# Linara Home — Product Requirements Document (PRD)

This document defines the complete, implementation-ready product specifications for **Linara** (app) / **Linara Home** (product & entity), a kitchen-style operating system for the Filipino household. It aligns family managers and household staff (kasambahay, yaya, cook, driver, all-around) on clear terms of work, schedule, pay, and rest, ensuring dignity by design and high operational clarity.

Reference Document: [`home-management-concept.md`](home-management-concept.md)

---

## 1. High-Level System Goals & Context

### 1.1 Objective & Vision

The informal domestic work sector in the Philippines lacks systematic documentation. Contracts, task definitions, schedules, and financial records (such as vales, 13th-month accruals, and rest days) are rarely recorded. Relying heavily on raw messaging (Viber, SMS, Messenger) leads to high turnover, communication friction, and a lack of verifiable work history for helpers.

**Linara** resolves this by operating as a "restaurant management system for the home":

- **Clarity over Control:** Tasks are tickets with clear "House Standards" (Standard Operating Procedures - SOPs).
- **Dignity by Design:** The helper is a first-class user who owns their account and can carry their verified history to future employers.
- **Filipino-First Realities:** Native support for Batas Kasambahay guidelines, vales (salary advances), 13th-month calculations, palengke (wet market) budgets, live-in/live-out rest boundaries, and Taglish communication.
- **Presence for Distant Family:** An Overseas Filipino Worker (OFW) parent can see the household run and manage payroll from abroad without micro-managing or breaching helper boundaries.

### 1.2 User Roles & Permissions

The system coordinates three key actors with distinct permission boundaries:

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

## 2. Step-by-Step User Flows

### 2.1 Onboarding and Account Handshake Flow (With Flagging Safeguards)

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
       │                                                              │      ├─── If terms match ──► [Creates Password & Claims]
       │                                                              │      └─── If mismatch ─────► [Flags fields & Halts]
       ▼                                                              ▼
```

1.  **Employer Invitation:** The Primary Manager inputs the worker's details (Name, Station/Role, Base Wage, Shift Start/End, Weekly Rest Day, and Contact). The system generates a single-use 6-digit alphanumeric `Invitation Code` (e.g., `LN98A2`) and a signup link.
2.  **Helper Review & Claim:** The helper accesses the app and enters the `Invitation Code`. The helper sees a clear, read-only summary of the terms entered by the employer (Transparency View).
3.  **Terms Validation & Mismatch Flagging:**
    - **Agreement:** If the terms match their verbal agreement, the helper inputs their own secure password, claims the seat, and locks the account. The profile status transitions from `PENDING_CLAIM` to `ACTIVE`.
    - **Mismatch Flagging:** If a term (such as wage rates or shift hours) is incorrect, the helper taps `"Something's not right?"`, logs specific feedback notes, and flags the discrepancies.
    - **Claim Suspension:** The onboarding claims process is frozen. Discrepancy rows are written to the `invite_flags` table and surface directly in the manager's `<NeedsYou />` feed as high-priority actionable alerts with a **"Mark Resolved"** trigger. The helper cannot claim the account until the manager resolves the flags or updates the terms.
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
    - `Pack bags` (Lead time: `-10 hours` -> schedules automatically for Thursday at 8:00 PM).
    - `Prepare baon` (Lead time: `-2 hours` -> schedules automatically for Friday at 4:00 AM).
    - `Wake driver & load car` (Lead time: `-45 minutes` -> schedules automatically for Friday at 5:15 AM).
3.  **Rescheduling Propagation:** Sir's flight is delayed to Friday at 9:00 AM. The manager edits the appointment time.
4.  **Task Recalculation:** The system automatically shifts dependent tasks:
    - `Pack bags` shifts to Thursday 11:00 PM.
    - `Prepare baon` shifts to Friday 7:00 AM.
    - `Wake driver` shifts to Friday 8:15 AM.
5.  **Helper Notification:** Instead of silent shifts, the assigned helper's station highlights: `"Sir's Flight moved to 9:00 AM. Your Pack Bags task is now scheduled for Thursday 11:00 PM."`

### 2.3 Quick Utos & Nightly Purge Flow

This handles trivial, short-order requests (e.g., "Add more rice," "Come to kitchen") without the bloat of formal task cards or the always-on "leash" of open chat.

1.  **Composition:** On the Pass, the Manager taps "Quick Uto" and either:
    - Selects a quick-chip (e.g., `+ Rice`, `Water`, `Front Door`).
    - Types a single line of text.
    - Holds to record a short (max 15-second) voice snippet.
2.  **Availability Filter:** The system checks the helper's status. If the helper is `Off`, the system holds the uto in a queue. If `On Shift` or `Available`, the uto is sent live.
3.  **Helper Station Display:** The uto appears at the bottom of the helper's screen as a lightweight, floating colored chip with a single `"Got it"` or `"Done"` action button.
4.  **No Back-and-Forth:** Once tapped, the manager's screen updates to "Done." There is no typing capability for the helper to prevent open-ended chat rooms.
5.  **Nightly Wipe & Gentle Mirror:** At midnight, all individual Quick Utos and voice notes are permanently deleted from the database. The system increments an aggregated daily counter of total asks to show a gentle mirror to the manager (`"You sent 12 small asks today"`), then resets the counter to zero. No historical archive of specific utos is retained to prevent performance scoring or scrutiny.

### 2.4 After-Hours Escalation & Ledger Accrual Flow

Enforces rest boundaries for live-in helpers while accommodating real-world emergencies.

1.  **Trigger Event:** A manager attempts to send a task or Quick Uto to a helper who is currently `Off` (either because they are out of shift hours, on a break, or on their weekly rest day).
2.  **Friction Wall Encounter:** The system blocks immediate sending and displays a modal:
    - _If normal off-shift:_ `"Rosa is currently Off-Shift. Sending this now will disturb her rest and log 30 mins of Rest Owed to her ledger. Proceed?"`
    - _If overnight hard-off (10 PM - 6 AM) or Rest Day:_ `"Rosa is on overnight rest / her Rest Day. Reaching her requires emergency override. This will be logged on the ledger. Proceed?"`
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

### 3.1 Helper Invitation & Account Claiming

#### Data Model: `HelperProfile`

```typescript
interface HelperProfile {
  id: string;
  userId: string | null; // References claimed User account
  householdId: string;
  name: string;
  station: "Yaya" | "Cook" | "Laundry" | "Driver" | "House"; // Colocated operational lanes
  monthlyRate: number; // in PHP
  paydayInterval: "semi_monthly" | "monthly";
  shiftStart: string; // HH:MM:SS
  shiftEnd: string; // HH:MM:SS
  dailyBreakDuration: number; // in minutes
  weeklyRestDay: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0, etc.
  inviteCode: string | null; // 6-digit alphanumeric
  status: "PENDING_CLAIM" | "ACTIVE" | "INACTIVE";
}
```

#### Data Model: `InviteFlag`

```typescript
interface InviteFlag {
  id: string;
  inviteId: string; // References associated helper invite profile id
  field: "wage" | "shift" | "restDay" | "station"; // Field flagged as incorrect
  note: string | null; // Explanatory notes by helper
  createdAt: string; // ISO 8601
}
```

#### API: Initiate Helper Invite

- **Path:** `POST /api/helpers/invite`
- **Method:** `POST`
- **Request Headers:** `Authorization: Bearer <JWT>`
- **Input (Manager Role Auth):**
  ```json
  {
    "name": "Maria Rosa",
    "station": "Cook",
    "monthlyRate": 8000,
    "paydayInterval": "semi_monthly",
    "shiftStart": "06:00:00",
    "shiftEnd": "18:00:00",
    "dailyBreakDuration": 120,
    "weeklyRestDay": 0
  }
  ```
- **Output:**
  ```json
  {
    "helperId": "hp_981273",
    "inviteCode": "LN98A2",
    "inviteUrl": "https://linara.ph/claim?code=LN98A2",
    "status": "PENDING_CLAIM"
  }
  ```

#### API: Verify Helper Invite (Pre-Claim Audit)

- **Path:** `GET /api/helpers/claim/verify`
- **Method:** `GET`
- **Query Parameters:** `code=LN98A2`
- **Output:**
  ```json
  {
    "inviteCode": "LN98A2",
    "name": "Maria Rosa",
    "station": "Cook",
    "monthlyRate": 8000,
    "shiftStart": "06:00:00",
    "shiftEnd": "18:00:00",
    "weeklyRestDay": 0
  }
  ```

#### API: Flag Term Discrepancy

- **Path:** `POST /api/helpers/claim/flag`
- **Method:** `POST`
- **Input (Unauthenticated):**
  ```json
  {
    "inviteCode": "LN98A2",
    "field": "wage",
    "note": "We agreed on ₱8,500 monthly rate, not ₱8,000."
  }
  ```
- **Output:**
  ```json
  {
    "flagId": "flg_19283a",
    "status": "SUSPENDED"
  }
  ```

#### API: Claim Helper Invite

- **Path:** `POST /api/helpers/claim`
- **Method:** `POST`
- **Input (Unauthenticated):**
  ```json
  {
    "inviteCode": "LN98A2",
    "email": "rosa.maria@gmail.com",
    "password": "hashed_password_string_here"
  }
  ```
- **Output:**
  ```json
  {
    "accessToken": "jwt_token_here",
    "refreshToken": "refresh_token_here",
    "userId": "usr_991823",
    "helperId": "hp_981273"
  }
  ```

### 3.2 Ticket State Transitions

#### Data Model: `Ticket`

```typescript
interface Ticket {
  id: string;
  householdId: string;
  title: string;
  notes: string | null;
  helperId: string; // Links to HelperProfile
  status: "todo" | "in_progress" | "done" | "blocked"; // Backwards compatible
  sopId: string | null; // Links to House SOP
  photoEvidenceUrl: string | null;
  isAfterHours: boolean;
  scheduledStart: string; // ISO 8601
  actualStart: string | null;
  actualEnd: string | null;
  createdBy: string; // User profile id
}
```

#### API: Update Ticket Status

- **Path:** `PATCH /api/tickets/:id/status`
- **Method:** `PATCH`
- **Request Headers:** `Authorization: Bearer <JWT>`
- **Input (Helper or Manager Auth):**
  ```json
  {
    "status": "in_progress",
    "timestamp": "2026-07-24T18:05:00Z"
  }
  ```
- **Output:**
  ```json
  {
    "ticketId": "tk_55021",
    "status": "in_progress",
    "activeSince": "2026-07-24T18:05:00Z"
  }
  ```

#### API: Complete Ticket with Photo Evidence

- **Path:** `POST /api/tickets/:id/complete`
- **Method:** `POST`
- **Request Headers:** `Authorization: Bearer <JWT>`
- **Input (Helper Auth):** Multipart Form Data containing:
  - `photo`: Image Binary (JPEG/PNG)
  - `notes`: String (optional)
- **Output:**
  ```json
  {
    "ticketId": "tk_55021",
    "status": "done",
    "photoEvidenceUrl": "https://storage.linara.ph/evidence/tk_55021_done.jpg",
    "ledgerEntryCreated": false
  }
  ```

### 3.3 Quick Utos Actions

#### Data Model: `QuickUto`

```typescript
interface QuickUto {
  id: string;
  senderName: string; // Display name of admin (e.g. "Sir Ben")
  recipientId: string; // HelperProfile id
  content: string;
  ackState: "sent" | "seen" | "done";
  afterHours: boolean;
  emergency: boolean;
  waiting: boolean;
  createdAt: string; // ISO 8601
}
```

#### API: Send Quick Uto

- **Path:** `POST /api/utos/send`
- **Method:** `POST`
- **Request Headers:** `Authorization: Bearer <JWT>`
- **Input (Admin Auth):**
  ```json
  {
    "recipientId": "hp_981273",
    "content": "+ Rice"
  }
  ```
- **Output:**
  ```json
  {
    "utosId": "ut_00192a",
    "status": "sent",
    "timestamp": "2026-07-24T19:30:00Z",
    "isWaitingOffline": false
  }
  ```

#### API: Acknowledge Quick Uto

- **Path:** `POST /api/utos/:id/ack`
- **Method:** `POST`
- **Request Headers:** `Authorization: Bearer <JWT>`
- **Input (Helper Auth):**
  ```json
  {
    "ackState": "done"
  }
  ```
- **Output:**
  ```json
  {
    "utosId": "ut_00192a",
    "ackState": "done"
  }
  ```

---

## 4. Detailed Interface & Dashboard Structure

### 4.1 Manager's Pass (Web/Mobile App Dashboard)

Designed as a read-mostly "Pass view" for immediate home evaluation. Displays status indicators and active operational boards.

#### Key Layout Fields:

1.  **Header:** Sim clock controllers, end-of-day buttons, notifications, and profile switchers.
2.  **The Pulse Line:** Single high-contrast status bar highlighting live statistics (e.g., `"6 of 9 Completed · 2 In Progress"`). Renders a dynamic `"Needs You"` alerts container for ticket blocks, vale claims, and onboarding flags.
3.  **Active Board Toggles:** Horizontal switches to change views:
    - **The Line:** Swimlanes organized vertically by Helper Station/Operational lane.
    - **The Board:** Traditional Kanban (Todo, Doing, Done).
4.  **Dials Section:**
    - **Spend Dial:** Visual progress bar tracking actual petty cash spent against the periodic grocery budget.
    - **Pay Dial:** Upcoming wage calculation, active vale reductions, and accumulated after-hours rest owed.

### 4.2 Worker's Station (Mobile Interface)

Optimized for high-contrast mobile viewing, large hit targets, Taglish support, and clear physical boundaries.

#### Key Layout Fields:

1.  **Dignity Header:** Greeting, active status toggles (`"On Shift"`, `"Available"`, `"Off"`), and a visual countdown to their next weekly rest day.
2.  **Active Focus Card:** Large-type focus layout detailing the single task currently at hand. Houses the "House Standard" checklist and a single start/done action button.
3.  **Quick Utos Area:** Floating, transient modules displaying short instructions. Tapping "Got It" acknowledge the ask immediately, cleaning up the layout.
4.  **Private Notes Scratchpad:** Completely secure text area allowing helpers to record personal grocery logs or observations. Includes a **"🎙️ Hold to Record"** voice notepad trigger. Renders an **"Add to board"** option to immediately promote a private note into a shared task board ticket.
5.  **My Pay Tab:** Transparent payslips, vale histories, and real-time "Rest Owed" minutes calculations.

---

## 5. Explicit Integrations & Security Boundaries

### 5.1 Cloud Storage & Photo Processing

- **Service Provider:** Supabase Storage / S3 compatible object storage buckets.
- **Use Cases:** Compression-ready JPEG/PNG uploads for ticket evidence and receipts, and audio/webm voice scratchpads.
- **Security Protocol:** Signed access tokens expiring in 15 minutes to guarantee household privacy.

### 5.2 Helper Notes Data Privacy Isolation (The Privacy Wall)

- Helper's private notes text data must reside strictly in local client storage or a database utilizing Row-Level Security (RLS).
- The database blocks managers or system administrators from querying notes:
  ```sql
  ALTER TABLE helper_notes ENABLE ROW LEVEL SECURITY;
  CREATE POLICY helper_notes_privacy ON helper_notes
    USING (auth.uid() = user_id);
  ```

### 5.3 Batas Kasambahay Compliance Engine

- **Legal Reference:** RA 10361.
- **Wage Verification:** Checks regional minimum figures (NCR: ₱6,000).
- **Accrual Logic:** Automatic calculations for 13th-month pays: `(Base Monthly Wage / 12) * Months Worked`.
- **Statutory Split Matrix:** Auto-calculates contributions based on NCR brackets:
  - Employer pays 100% of SSS/PhilHealth/Pag-IBIG if helper wage is less than ₱5,000.
  - Standard split applies for wages ₱5,000 and above.

---

## 6. Verification & Simulated Testing

### 6.1 Operational Testing & Persona Traversal

To test multi-user real-time synchronization, edge states, and rest boundaries, developers utilize simulated testing offsets:

- **The Simulation Clock (`simOffsetMs`):** A client-side global timezone controller that shifts local browser clocks forward or backward.
- **Scenario Testing Rules:**
  1.  **Quiet-Hours & Off-Shift Gates:** Set simulated time to after 10:00 PM. Attempting to assign a task must immediately trigger the off-shift friction warning and log rest-owed minutes upon completion.
  2.  **Midnight Purges:** Jump simulated time past midnight. The system must automatically trigger the Quick Utos table deletions and increment the manager's aggregated daily count mirror.
  3.  **Cross-Device Handshakes:** Test invites across multiple tabs simultaneously (Tab 1: Sir Ben, Tab 2: Ate Rosa), validating that flagging terms suspends claims in real-time.
