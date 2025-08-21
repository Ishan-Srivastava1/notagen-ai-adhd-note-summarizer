import { Router } from "express";
import { z } from "zod";
import { parseOrThrow } from "../utils/validate";
import { randomUUID } from "crypto";

const router = Router();

const TTSBody = z.object({
  text: z.string().min(1),
  voice: z.string().default("Joanna")
});

router.post("/", (req, res) => {
  const { text, voice } = parseOrThrow(TTSBody, req.body);
  const key = `audio/mock-${randomUUID()}.mp3`;
  const url = `https://example.com/${key}?signature=mock&expires=3600`;

  res.json({
    key,
    url,
    meta: {
      chars: text.length,
      voice,
      engine: "neural",
      provider: "mock"
    }
  });
});

export default router;
