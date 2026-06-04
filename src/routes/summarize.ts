import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { parseOrThrow } from "../utils/validate";
import { streamSummarizeChunks, summarizeText } from "../lib/openai";
import { contentHash } from "../utils/hash";
import {
  getCachedSummary,
  setCachedSummary,
  invalidateCachedNote,
  invalidateCachedNotesList,
} from "../utils/cache";
import prisma from "../lib/prisma";

const router = Router();

const Body = z.object({
  text: z.string().min(10, "Provide at least 10 characters"),
  noteId: z.string().optional(),
});

function persistSummaryAsync(noteId: string, summary: unknown, hash: string) {
  prisma.note
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ where: { id: noteId }, data: { summary: summary as any, summaryHash: hash } })
    .then(() => {
      invalidateCachedNote(noteId).catch(() => null);
      invalidateCachedNotesList().catch(() => null);
    })
    .catch(() => null);
}

// SSE streaming handler (?stream=1)
async function handleStream(req: Request, res: Response, next: NextFunction) {
  try {
    const { text, noteId } = parseOrThrow(Body, req.body);
    const hash = contentHash(text);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

    const cached = await getCachedSummary(hash);
    if (cached) {
      if (noteId) persistSummaryAsync(noteId, cached, hash);
      send({ type: "done", summary: cached, cached: true });
      return res.end();
    }

    let raw = "";
    for await (const chunk of streamSummarizeChunks(text)) {
      raw += chunk;
      send({ type: "chunk", text: chunk });
    }

    let summary: unknown;
    try {
      summary = JSON.parse(raw);
    } catch {
      send({ type: "error", message: "Gemini returned non-JSON content" });
      return res.end();
    }

    setCachedSummary(hash, summary).catch(() => null);
    if (noteId) persistSummaryAsync(noteId, summary, hash);

    send({ type: "done", summary, cached: false });
    return res.end();
  } catch (err: any) {
    try {
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      res.end();
    } catch {
      next(err);
    }
  }
}

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  if (req.query.stream === "1" || req.query.stream === "true") {
    return handleStream(req, res, next);
  }

  try {
    const { text, noteId } = parseOrThrow(Body, req.body);
    const hash = contentHash(text);

    const cached = await getCachedSummary(hash);
    if (cached) {
      if (noteId) persistSummaryAsync(noteId, cached, hash);
      return res.json({
        summary: cached,
        meta: { inputChars: text.length, cached: true, model: process.env.GEMINI_MODEL || "gemini-1.5-flash" },
      });
    }

    const summary = await summarizeText(text);

    setCachedSummary(hash, summary).catch(() => null);
    if (noteId) persistSummaryAsync(noteId, summary, hash);

    return res.json({
      summary,
      meta: { inputChars: text.length, cached: false, model: process.env.GEMINI_MODEL || "gemini-1.5-flash" },
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
