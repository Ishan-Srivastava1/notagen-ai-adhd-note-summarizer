import { Router } from "express";
import { z } from "zod";
import { parseOrThrow } from "../utils/validate";

const router = Router();

const SummarizeBody = z.object({
  text: z.string().min(10, "Provide at least 10 characters"),
  settings: z.object({
    bullets: z.boolean().default(true),
    maxTokens: z.number().int().min(100).max(2000).default(400)
  }).partial().default({})
});

router.post("/", (req, res) => {
  const { text } = parseOrThrow(SummarizeBody, req.body);

  const mock = {
    bullets: [
      "Key concept: Working memory limitations—keep chunks short.",
      "Lecture split into 3 sections: Intro, Case Study, Takeaways."
    ],
    highlights: [
      "Professor emphasized spaced repetition.",
      "Example: Pomodoro helped with retention."
    ],
    deadlines: [{ label: "Homework 2", due: "2025-09-05" }],
    actions: [
      { label: "Create 3 flash cards for each section", priority: "high" },
      { label: "Schedule 25-min review session", priority: "medium" }
    ],
    meta: {
      inputChars: text.length,
      cached: false,
      model: "mock"
    }
  };

  res.json({ summary: mock });
});

export default router;
