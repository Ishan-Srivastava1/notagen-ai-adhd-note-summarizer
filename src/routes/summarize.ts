import { Router } from "express";
import { z } from "zod";
import { parseOrThrow } from "../utils/validate";
import { summarizeText } from "../lib/openai";
import { contentHash } from "../utils/hash";
import { getCachedSummary, setCachedSummary } from "../utils/cache";
// (optional) import prisma if you want to also persist on a noteId

const router = Router();

const Body = z.object({
  text: z.string().min(10, "Provide at least 10 characters"),
  noteId: z.string().optional() // keep if you plan to persist to DB
});

router.post("/", async (req, res, next) => {
  try {
    const { text, noteId } = parseOrThrow(Body, req.body);

    const hash = contentHash(text);

    // 1) Try cache
    const cached = await getCachedSummary(hash);
    if (cached) {
      return res.json({
        summary: cached,
        meta: {
          inputChars: text.length,
          cached: true,
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        },
      });
    }

    // 2) Call OpenAI
    const summary = await summarizeText(text);

    // 3) Save to cache
    await setCachedSummary(hash, summary);

    // 4) (Optional) If you already wired Prisma + /notes, you can also persist to DB here when noteId is provided.
    // await prisma.note.update({ where: { id: noteId }, data: { summary: JSON.stringify(summary), summaryHash: hash } }).catch(() => null);

    res.json({
      summary,
      meta: {
        inputChars: text.length,
        cached: false,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
