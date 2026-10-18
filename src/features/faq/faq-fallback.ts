import type { Faq } from "./faq.types";

/**
 * Shown when the faqs table is missing, empty or unreachable, so /faq never
 * renders blank. Every fact comes from PRODUCT.md, plan.md and the privacy
 * policy; nothing here claims a price, a customer or a feature that does not
 * exist yet.
 */
export const FAQ_FALLBACK: Faq[] = [
  {
    id: "fallback-what",
    question: "What is Linara?",
    answer:
      "Linara is a way for a Filipino household and the people who help run it to manage work, pay and care together, on fair terms. Tasks, schedules, the pantry and payslips live in one place instead of in a group chat and memory.",
    category: "General",
    sortOrder: 1,
    published: true,
  },
  {
    id: "fallback-who",
    question: "Who is Linara for?",
    answer:
      "Managers run the household from the web dashboard or the app: a working parent at home, an OFW parent abroad, or a relative managing on someone's behalf. Helpers (kasambahay) use their own app, the Worker's Station.",
    category: "General",
    sortOrder: 2,
    published: true,
  },
  {
    id: "fallback-kasambahay",
    question: "What does my kasambahay use?",
    answer:
      "She has her own app, the Worker's Station. She owns her login, sees the same pay, vale and rest-owed numbers the family sees, and keeps her record if she leaves the household.",
    category: "General",
    sortOrder: 3,
    published: true,
  },
  {
    id: "fallback-payslips",
    question: "How do payslips work?",
    answer:
      "Linara prepares a payslip for each pay period with the statutory contributions and any vale deducted, so both sides see how the net pay was reached. Online payouts are still in testing, so payslips also record payments made outside the app.",
    category: "Pay",
    sortOrder: 1,
    published: true,
  },
  {
    id: "fallback-privacy",
    question: "Can I read my helper's private notes?",
    answer:
      "No. A helper's private notes are visible only to her. Linara is built so that a manager cannot open them, however the account is set up.",
    category: "Privacy",
    sortOrder: 1,
    published: true,
  },
  {
    id: "fallback-deletion",
    question: "Can I have my data deleted?",
    answer:
      "Yes. You can ask for your account to be deleted at any time, and the privacy policy explains what is removed and what a household must keep. Quick Utos are deleted every night in any case.",
    category: "Privacy",
    sortOrder: 2,
    published: true,
  },
  {
    id: "fallback-pricing",
    question: "How much does Linara cost?",
    answer:
      "Pricing is by conversation for now. Message us and we will talk through what your household needs.",
    category: "Help",
    sortOrder: 1,
    published: true,
  },
  {
    id: "fallback-help",
    question: "How do I get help?",
    answer:
      "Use the Message us link at the bottom of this page, or open Help in the manager dashboard. We read every message.",
    category: "Help",
    sortOrder: 2,
    published: true,
  },
];
