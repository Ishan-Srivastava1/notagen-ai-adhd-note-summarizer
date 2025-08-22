import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export async function summarizeText(text: string) {
  const today = new Date().toISOString().slice(0, 10);

  // New contract with categories
  const jsonContract = `{
    "bullets": { "text": string, "category": "concept" | "definition" | "example" | "tip" | "warning" }[],
    "highlights": { "text": string, "category": "key" | "insight" | "result" | "quote" }[],
    "deadlines": { "label": string, "due": string, "category": "deadline" }[],
    "actions": { "label": string, "priority": "low"|"medium"|"high", "category": "action" }[]
  }`;

  const system = [
    "You are a summarizer that outputs STRICT JSON only (no prose).",
    `Today's date: ${today} (America/New_York).`,
    "Convert relative dates to ISO YYYY-MM-DD.",
    "Only return keys exactly as in the contract. Keep texts short and scannable."
  ].join(" ");

  const resp = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Summarize for ADHD-friendly review. Match this JSON exactly:\n${jsonContract}\n---\n${text}` },
    ],
  });

  const content = resp.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}

