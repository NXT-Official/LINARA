export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
};

export type FaqSource = "db" | "fallback";
