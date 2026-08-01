// A helper's private scratchpad entry. Stored per-helper in localStorage, never shared.

export type MyNote = {
  id: string;
  text: string;
  done: boolean;
  voice?: boolean;
  createdAt: number;
};
