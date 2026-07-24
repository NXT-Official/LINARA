# Story 11: AI Temporal Scheduler Edge Function

## Objective
Build the AI Temporal Scheduler Edge Function to parse natural language appointment instructions, relative offsets, and role definitions, converting them into structured database rows.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 2.2 & 4
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 2.2 & 6.2
*   AI Agent Spec: [`aiagent.md`](../aiagent.md) Section 3

## Dependencies
*   [`Story_10_AISOPGeneratorEdgeFunction.md`](Story_10_AISOPGeneratorEdgeFunction.md)

## Explicit Inputs
*   File: [`aiagent.md`](../aiagent.md) Section 3 (Prompts and JSON Schema)
*   Variable: `simOffsetMs` (tracks base clock target)

## Step-by-Step Implementation Instructions
1.  **Code the Edge Function:** Setup an edge function `/functions/parse-scheduler` in Supabase.
2.  **Embed Parsing Logic:** Program the system prompts in [`aiagent.md`](../aiagent.md) Section 3.2. Teach the engine to identify the core appointment anchor, parse natural language offset keywords (e.g. *"10h before"*, *"45 mins after"*), and translate them to negative/positive minutes offsets.
3.  **Validate Output Schema:** Enforce strict JSON output parameters based on the [`aiagent.md`](../aiagent.md) Section 3.4 schema, returning the appointment metadata and child task array.
4.  **Integrate UI Elements:** Connect the "Schedule with AI" prompt box on the manager's calendar view to trigger the scheduler function.

## Expected Output
*   Edge Function: `/functions/parse-scheduler`
*   Structured JSON outputs defining keys: `appointment` (title, scheduledTime) and `prepTasks` (title, station, offsetMinutes).

## Testable Acceptance Criteria
1.  Sending raw prompt *"Flight on Friday at 8am, pack bags 12h before"* returns structured JSON with an anchor at `08:00` and a child task with `offsetMinutes: -720`.
2.  The scheduler assigns the driver role automatically if instructions refer to airport drops.
3.  Moving or changing the appointment time on the calendar successfully recalculates all child task scheduled times instantly.

## Done Definition
The natural language temporal parser is fully deployed, returns validated JSON objects, and recalculates offsets reliably upon parent appointment shifts.
