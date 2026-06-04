import type { Summary } from "./types";

export function normalizeSummary(s: any): Summary {
  if (s?.bullets?.[0]?.text !== undefined) return s as Summary;

  const toBullet = (t: string) => ({
    text: t,
    category: guessCategory(t),
  });

  const bullets = (s?.bullets ?? []).map(toBullet);
  const highlights = (s?.highlights ?? []).map((t: string) => ({ text: t, category: "key" as const }));
  const deadlines = (s?.deadlines ?? []).map((d: any) => ({ label: d.label, due: d.due, category: "deadline" as const }));
  const actions = (s?.actions ?? []).map((a: any) => ({ label: a.label, priority: a.priority || "medium", category: "action" as const }));

  const topics = (s?.topics ?? []).map((t: any) => ({
    name: t.name ?? "",
    description: t.description ?? "",
    searchQuery: t.searchQuery ?? t.name ?? "",
  }));
  const studyPlan = (s?.studyPlan ?? []).map((p: any) => ({
    day: Number(p.day) || 0,
    task: p.task ?? "",
    duration: p.duration ?? "",
    notes: p.notes ?? "",
  }));

  return { bullets, highlights, deadlines, actions, topics, studyPlan };
}

function guessCategory(t: string) {
  const lc = t.toLowerCase();
  if (/\bdefine|definition|means|is\b/.test(lc)) return "definition";
  if (/\bexample|e\.g\.|for instance\b/.test(lc)) return "example";
  if (/\bwarning|caution|pitfall|avoid\b/.test(lc)) return "warning";
  if (/\btip|best practice|recommend(ation)?\b/.test(lc)) return "tip";
  return "concept";
}
