# Story 10: AI SOP Generator Edge Function

## Objective

Develop, deploy, and integrate the House Standard SOP Generator onto Vercel / Supabase Edge Functions, validating results strictly against a specified JSON Schema to prevent hallucinations.

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 5 & 15
- Architecture Spec: [`architecture.md`](../architecture.md) Section 5.1 & 8
- AI Agent Spec: [`aiagent.md`](../aiagent.md) Section 2

## Dependencies

- [`Story_9_5_TestingFrameworkAndE2ESmokeSetup.md`](Story_9_5_TestingFrameworkAndE2ESmokeSetup.md)

## Explicit Inputs

- File: [`aiagent.md`](../aiagent.md) Section 2 (SOP Prompts and JSON Schema)
- Env Var: `SUPABASE_ANON_KEY`

## Step-by-Step Implementation Instructions

1.  **Code the Edge Function:** Setup an edge function `supabase/functions/generate-sop/index.ts` utilizing the LLM provider API.
2.  **Embed System Prompts:** Inject the system instructions, collaborative personas, and Taglish-friendly formatting guidelines defined in [`aiagent.md`](../aiagent.md) Section 2.2.
3.  **Enforce Strict JSON Outputs:** Set the LLM api call configuration to parse and output strictly using `response_format: { type: "json_object" }` structured by the [`aiagent.md`](../aiagent.md) Section 2.4 JSON schema.
4.  **Connect UI Forms:** Connect the "Create SOP" text input boxes inside `<RoutinesView />` to trigger the edge function, displaying loaders and populating generated steps automatically into the form.

## Expected Output

- Edge Function: `/functions/generate-sop`
- JSON response payloads structured with fields: `title`, `description`, `station`, `steps`, `toolsRequired`, and `safetyProtocol`.

## Testable Acceptance Criteria

1.  Sending raw input _"how to make baby milk"_ returns a JSON payload with valid, structured step arrays and correct safety warnings (e.g. wrist temp test).
2.  The resulting schema contains no conversational markdown preambles or arbitrary keys.
3.  Selecting different roles (e.g. `Cook`) correctly shifts semantic focus inside the generated output.

## Done Definition

The SOP generator edge function is deployed and integrated, formatting outputs strictly to the validated JSON schemas without errors.
