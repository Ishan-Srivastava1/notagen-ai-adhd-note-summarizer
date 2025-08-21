import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { parseOrThrow } from "../utils/validate";

const router = Router();
const FAKE_USER_ID = "demo-user"; // replace with real auth later

const CreateNote = z.object({
  title: z.string().min(1),
  rawText: z.string().min(1),
  summary: z.string().optional(),
  summaryHash: z.string().optional(),
  ttsKey: z.string().optional(),
});

const UpdateNote = z.object({
  title: z.string().min(1).optional(),
  rawText: z.string().min(1).optional(),
  summary: z.string().optional(),
  summaryHash: z.string().optional(),
  ttsKey: z.string().optional(),
});

router.get("/", async (_req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: FAKE_USER_ID },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  res.json({ notes });
});

router.get("/:id", async (req, res) => {
  const note = await prisma.note.findFirst({
    where: { id: req.params.id, userId: FAKE_USER_ID },
  });
  if (!note) return res.status(404).json({ error: "Not found" });
  res.json({ note });
});

router.post("/", async (req, res) => {
  const body = parseOrThrow(CreateNote, req.body);

  // ✅ Ensure the demo user exists (avoids FK violation)
  await prisma.user.upsert({
    where: { id: FAKE_USER_ID },
    update: {},
    create: { id: FAKE_USER_ID, email: "demo@example.com" },
  });

  const note = await prisma.note.create({
    data: { ...body, userId: FAKE_USER_ID },
  });

  res.status(201).json({ note });
});

router.patch("/:id", async (req, res) => {
  const data = parseOrThrow(UpdateNote, req.body);
  const note = await prisma.note
    .update({ where: { id: req.params.id }, data })
    .catch(() => null);
  if (!note) return res.status(404).json({ error: "Not found" });
  res.json({ note });
});

router.delete("/:id", async (req, res) => {
  const deleted = await prisma.note
    .delete({ where: { id: req.params.id } })
    .catch(() => null);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

export default router;
