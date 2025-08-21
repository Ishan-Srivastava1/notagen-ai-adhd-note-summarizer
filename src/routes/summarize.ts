// src/routes/summarize.ts
import { Router } from "express";
import { z } from "zod";
import { parseOrThrow } from "../utils/validate";
import { summarizeText } from "../lib/openai";
import { contentHash } from "../utils/hash";
import { getCachedSummary, setCachedSummary } from "../utils/cache";
import prisma from "../lib/prisma";

const router = Router();

const Body = z.object({
  text: z.string().min(10, "Provide at least 10 characters"),
  noteId: z.string().optional()
});

router.post("/", async (req, res, next) => {
  try {
    const { text, noteId } = parseOrThrow(Body, req.body);
    const hash = contentHash(text);

    // 1) Try Redis cache
    const cached = await getCachedSummary(hash);
    if (cached) {
      // ✅ write-through to DB if noteId was provided (so the note gets summary even on cache hits)
      if (noteId) {
        
        await prisma.note.update({
          where: { id: noteId },
          data: {
            summary: cached,
            summaryHash: hash,
          },
        }).catch(() => null);
      }

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

    // 3) Save to Redis cache
    await setCachedSummary(hash, summary);

    // 4) Persist to DB if a noteId was provided
    if (noteId) {
      await prisma.note.update({
        where: { id: noteId },
        data: {
          summary,
          summaryHash: hash,
        },
      }).catch(() => null);
    }

    // 5) Return response
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
