export type ChipColor =
  | "indigo" | "sky" | "emerald" | "amber" | "rose" | "slate" | "violet" | "orange";

export function categoryColor(category?: string): ChipColor {
  switch (category) {
    case "definition": return "indigo";
    case "concept":    return "violet";
    case "example":    return "sky";
    case "tip":        return "emerald";
    case "warning":    return "rose";
    case "deadline":   return "orange";
    case "key":
    case "insight":
    case "result":
    case "quote":      return "slate";
    case "action":     return "amber";
    default:           return "slate";
  }
}

export function chipClass(color: ChipColor) {
  const map: Record<ChipColor, string> = {
    indigo:  "bg-indigo-50 text-indigo-700 border-indigo-200",
    violet:  "bg-violet-50 text-violet-700 border-violet-200",
    sky:     "bg-sky-50 text-sky-700 border-sky-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-800 border-amber-200",
    orange:  "bg-orange-50 text-orange-700 border-orange-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
    slate:   "bg-slate-100 text-slate-800 border-slate-200",
  };
  return `inline-flex items-center text-xs px-2 py-1 rounded border ${map[color]}`;
}
