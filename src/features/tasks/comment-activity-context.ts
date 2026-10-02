import { createContext, useContext } from "react";

import type { CommentActivityStore } from "./hooks/use-comment-activity";

export const CommentActivityContext = createContext<CommentActivityStore | undefined>(undefined);

const EMPTY: CommentActivityStore = {
  activity: {},
  isNew: () => false,
  markSeen: () => {},
  refresh: () => {},
};

/** Outside the dashboard (tests, previews) there are simply no badges. */
export function useCommentActivityStore(): CommentActivityStore {
  return useContext(CommentActivityContext) ?? EMPTY;
}
