export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  published: boolean;
};

/** What the editor submits: a new row has no id yet. */
export type FaqDraft = Omit<Faq, "id"> & { id?: string };

export type FaqSource = "db" | "fallback";
