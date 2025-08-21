import { Router } from "express";
import { z } from "zod";
import { parseOrThrow } from "../utils/validate";
import { summarizeText } from "../lib/openai";  

const router = Router();

const SummarizeBody = z.object({
  text: z.string().min(10, "Provide at least 10 characters"),
  settings: z
    .object({
      bullets: z.boolean().default(true),
      maxTokens: z.number().int().min(100).max(2000).default(400),
    })
    .partial()
    .default({}),
});

router.post("/", async (req, res) => {
  try {
    const { text } = parseOrThrow(SummarizeBody, req.body);

    const summary = await summarizeText(text);

    res.json({
      summary,
      meta: {
        inputChars: text.length,
        cached: false,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Summarization failed" });
  }
});

export default router;
