export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  published: boolean;
};

export type FaqSource = "db" | "fallback";
