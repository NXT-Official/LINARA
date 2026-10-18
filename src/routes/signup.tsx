import { createFileRoute } from "@tanstack/react-router";

import {
  ManagerAuthFlow,
  SIGNUP_STEPS,
  type SignupStep,
} from "@/features/people/components/manager-auth-flow";

type SignupSearch = { step?: SignupStep };

// Opens on "Which one are you?". Each step after it is its own `?step=`, so
// Back and Forward move between steps and a step survives a reload. An
// unknown step is set to undefined, not left out: a left-out key keeps the
// raw value from the URL.
export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    step: SIGNUP_STEPS.includes(search.step as SignupStep)
      ? (search.step as SignupStep)
      : undefined,
  }),
  component: SignupPage,
});

function SignupPage() {
  const { step } = Route.useSearch();
  return <ManagerAuthFlow page="signup" step={step} />;
}
