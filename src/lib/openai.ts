import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export async function summarizeText(text: string) {
  const jsonContract = `{
    "bullets": string[],
    "highlights": string[],
    "deadlines": { "label": string, "due": string }[],
    "actions": { "label": string, "priority": "low"|"medium"|"high" }[]
  }`;

  const system = [
    "You are a summarizer that outputs STRICT JSON.",
    "Return only valid JSON with keys bullets, highlights, deadlines, actions.",
    "Use ISO-8601 dates for all 'due' fields."
  ].join(" ");

  const resp = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" }, // works with chat.completions
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Summarize the text below for ADHD-friendly review and match this JSON contract exactly:\n${jsonContract}\n---\n${text}` }
    ],
  });

  const content = resp.choices[0]?.message?.content ?? "{}";
  // content is a JSON string because of response_format
  return JSON.parse(content);
}
