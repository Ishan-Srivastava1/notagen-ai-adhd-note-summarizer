export type Summary = {
  bullets: { text: string; category: "concept" | "definition" | "example" | "tip" | "warning" }[];
  highlights: { text: string; category: "key" | "insight" | "result" | "quote" }[];
  deadlines: { label: string; due: string; category: "deadline" }[];
  actions: { label: string; priority: "low" | "medium" | "high"; category: "action" }[];
};
