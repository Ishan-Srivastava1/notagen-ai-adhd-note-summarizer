import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { parseOrThrow } from "../utils/validate";
import {
  getCachedNote,
  setCachedNote,
  getCachedNotesList,
  setCachedNotesList,
  invalidateNoteAndList,
  invalidateCachedNotesList,
} from "../utils/cache";

const router = Router();
const FAKE_USER_ID = "demo-user";

const CreateNote = z.object({
  title:       z.string().min(1),
  rawText:     z.string().min(1),
  summary:     z.string().optional(),
  summaryHash: z.string().optional(),
  ttsKey:      z.string().optional(),
});

const UpdateNote = z.object({
  title:       z.string().min(1).optional(),
  rawText:     z.string().min(1).optional(),
  summary:     z.string().optional(),
  summaryHash: z.string().optional(),
  ttsKey:      z.string().optional(),
});

router.get("/", async (_req, res) => {
  const cached = await getCachedNotesList(FAKE_USER_ID);
  if (cached) return res.json({ notes: cached, meta: { cached: true } });

  const notes = await prisma.note.findMany({
    where:   { userId: FAKE_USER_ID },
    orderBy: { updatedAt: "desc" },
    take:    50,
  });

  setCachedNotesList(notes, FAKE_USER_ID).catch(() => null);
  return res.json({ notes, meta: { cached: false } });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  const cached = await getCachedNote(id);
  if (cached) return res.json({ note: cached, meta: { cached: true } });

  const note = await prisma.note.findFirst({ where: { id, userId: FAKE_USER_ID } });
  if (!note) return res.status(404).json({ error: "Not found" });

  setCachedNote(id, note).catch(() => null);
  return res.json({ note, meta: { cached: false } });
});

router.post("/", async (req, res) => {
  const body = parseOrThrow(CreateNote, req.body);

  await prisma.user.upsert({
    where:  { id: FAKE_USER_ID },
    update: {},
    create: { id: FAKE_USER_ID, email: "demo@example.com" },
  });

  const note = await prisma.note.create({ data: { ...body, userId: FAKE_USER_ID } });

  setCachedNote(note.id, note).catch(() => null);
  invalidateCachedNotesList(FAKE_USER_ID).catch(() => null);

  return res.status(201).json({ note });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const data = parseOrThrow(UpdateNote, req.body);

  const note = await prisma.note.update({ where: { id }, data }).catch(() => null);
  if (!note) return res.status(404).json({ error: "Not found" });

  await invalidateNoteAndList(id, FAKE_USER_ID);
  setCachedNote(id, note).catch(() => null);

  return res.json({ note });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const deleted = await prisma.note.delete({ where: { id } }).catch(() => null);
  if (!deleted) return res.status(404).json({ error: "Not found" });

  invalidateNoteAndList(id, FAKE_USER_ID).catch(() => null);
  return res.json({ ok: true });
});

export default router;
