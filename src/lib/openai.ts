import OpenAI from "openai";
import type { Summary } from "./types";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1",
});

export const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

function buildPrompt(text: string): string {
  const today = new Date().toISOString().slice(0, 10);

  const jsonContract = `{
    "bullets":   [{ "text": string, "category": "concept"|"definition"|"example"|"tip"|"warning" }],
    "highlights":[{ "text": string, "category": "key"|"insight"|"result"|"quote" }],
    "deadlines": [{ "label": string, "due": "YYYY-MM-DD", "category": "deadline" }],
    "actions":   [{ "label": string, "priority": "low"|"medium"|"high", "category": "action" }],
    "topics":    [{ "name": string, "description": string, "searchQuery": string }],
    "studyPlan": [{ "day": number, "task": string, "duration": string, "notes": string }]
  }`;

  return [
    `You are a summarizer that outputs STRICT JSON only (no prose, no markdown).`,
    `Today's date: ${today} (America/New_York). Convert relative dates to ISO YYYY-MM-DD.`,
    `Only return keys exactly as in the contract. Keep texts short and scannable.`,
    `For "topics": extract 3-6 key topics to focus on, each with a one-sentence description and a Google search query.`,
    `For "studyPlan": create a 5-7 day plan with specific daily tasks, time estimates (e.g. "30 min"), and brief notes.`,
    `Summarize for ADHD-friendly review. Match this JSON schema exactly:\n${jsonContract}\n---\n${text}`,
  ].join("\n");
}

export async function* streamSummarizeChunks(
  text: string,
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: buildPrompt(text) }],
      stream: true,
      response_format: { type: "json_object" },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) yield delta;
    }
  } catch (err: any) {
    const msg    = String(err?.message ?? err ?? "Unknown error");
    const status = Number(err?.status ?? err?.statusCode ?? 0);
    const is429  = status === 429 || /429|rate.?limit|quota/i.test(msg);

    console.error("[Groq] API error — status:", status, "| message:", msg);

    if (is429) {
      throw Object.assign(
        new Error(`Groq rate limit hit (429). Raw: ${msg}`),
        { status: 429 }
      );
    }
    throw Object.assign(new Error(`Groq API error: ${msg}`), { status: status || 502 });
  }
}

export async function summarizeText(text: string): Promise<Summary> {
  let raw = "";
  for await (const chunk of streamSummarizeChunks(text)) {
    raw += chunk;
  }
  try {
    return JSON.parse(raw) as Summary;
  } catch {
    throw Object.assign(new Error("Groq returned non-JSON content"), { status: 502, raw });
  }
}
