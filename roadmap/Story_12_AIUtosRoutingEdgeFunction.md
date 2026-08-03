# Story 12: AI Utos Routing Edge Function

## Objective

Deploy the Context Routing Edge Function, classifying momentary text or vocal transcriptions into core operational categories, and flagging shift boundary alerts if workers are currently off-duty.

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 2.3 & 3
- Architecture Spec: [`architecture.md`](../architecture.md) Section 2.3 & 6.3
- AI Agent Spec: [`aiagent.md`](../aiagent.md) Section 4

## Dependencies

- [`Story_11_AITemporalSchedulerEdgeFunction.md`](Story_11_AITemporalSchedulerEdgeFunction.md)

## Explicit Inputs

- File: [`aiagent.md`](../aiagent.md) Section 4 (Prompts and JSON Schema)
- State: `rosaStatus` and `schedules` definitions

## Step-by-Step Implementation Instructions

1.  **Code the Edge Function:** Setup an edge function `/functions/route-utos` inside the Supabase environment.
2.  **Embed Routing Engine:** Program the system instructions from [`aiagent.md`](../aiagent.md) Section 4.2. Isolate classification queries into:
    - `ROUTINE`: Highly repetitive systematic tasks.
    - `TASK`: One-off heavy tasks with photo standards.
    - `QUICK_UTO`: Transient, lightweight actions (+ rice).
    - `PRIVATE_NOTE`: Reminders authored by the helper.
3.  **Boundary Gating Logic:** Inject active checker parameters that read the recipient helper's schedule. If the helper is currently resting or off-shift, flag `boundaryWarn: true` in the output JSON.
4.  **Integrate UI Feed:** Bind text input triggers and mock voice recording buttons to execute the classification function.

## Expected Output

- Edge Function: `/functions/route-utos`
- JSON response payloads structured with: `classification`, `contentCleaned`, `suggestedStation`, and `boundaryWarn`.

## Testable Acceptance Criteria

1.  Submitting _"laundry every Tuesday"_ returns classification `ROUTINE` with station `Laundry`.
2.  Submitting a helper-written scratch note returns classification `PRIVATE_NOTE`.
3.  Sending _"please get more water"_ while the targeted helper is off-shift returns `boundaryWarn: true` to trigger the confirmation friction dialog.

## Done Definition

The context-routing edge classifier is deployed, parses transient text/vocal queries, and triggers correct off-hours boundary warning alerts.
