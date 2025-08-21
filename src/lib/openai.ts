import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export async function summarizeText(text: string) {
  const today = new Date().toISOString().slice(0, 10); // e.g., 2025-08-21

  const jsonContract = `{
    "bullets": string[],
    "highlights": string[],
    "deadlines": { "label": string, "due": string }[],
    "actions": { "label": string, "priority": "low"|"medium"|"high" }[]
  }`;

  const system = [
    "You are a summarizer that outputs STRICT JSON only.",
    `Today's date is ${today} (timezone: America/New_York).`,
    "When the text uses relative dates (e.g., 'tomorrow', 'next Friday'), you MUST convert them to real ISO-8601 dates (YYYY-MM-DD) relative to today's date.",
    "If the computed date would be in the past, roll it forward to the next valid occurrence.",
    "Return only valid JSON with keys bullets, highlights, deadlines, actions.",
  ].join(" ");

  const resp = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content:
          `Summarize the text below for ADHD-friendly review and match this JSON contract exactly:\n${jsonContract}\n---\n${text}`,
      },
    ],
  });

  const content = resp.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}
