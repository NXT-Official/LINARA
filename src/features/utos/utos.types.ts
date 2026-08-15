// A one-line ask sent to a helper. Deliberately ephemeral — wiped at start of day.

export type QuickUtos = {
  id: string;
  content: string;
  from: string; // admin display name (e.g. "Sir Ben")
  to: string; // recipient display name
  toHelperId: string; // recipient's real helper_profiles id
  timestamp: number;
  ackState: "sent" | "seen" | "done";
  afterHours?: boolean;
  emergency?: boolean;
  waiting?: boolean; // sent while Rosa is Off but not chosen to ping — sits as waiting
};
