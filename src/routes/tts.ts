import { Router, Request, Response, NextFunction } from "express";
import {
  PollyClient,
  SynthesizeSpeechCommand,
  Engine,
  OutputFormat,
  type VoiceId,
} from "@aws-sdk/client-polly";
import { Readable } from "stream";
import { z } from "zod";
import { parseOrThrow } from "../utils/validate";

const router = Router();

const NEURAL_VOICES = new Set([
  "Joanna", "Matthew", "Salli", "Kimberly", "Kendra",
  "Joey",   "Justin",  "Amy",   "Brian",    "Emma",
  "Olivia", "Aria",    "Ayanda","Ivy",      "Kevin",
  "Ruth",   "Stephen",
]);

const TTSBody = z.object({
  text:  z.string().min(1).max(3_000, "Polly limit: ≤3 000 chars per request"),
  voice: z.string().default("Joanna"),
});

let _polly: PollyClient | null = null;
function getPolly(): PollyClient {
  if (!_polly) {
    _polly = new PollyClient({
      region: process.env.AWS_REGION || "us-east-1",
      ...(process.env.AWS_ACCESS_KEY_ID
        ? {
            credentials: {
              accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
          }
        : {}),
    });
  }
  return _polly;
}

router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { text, voice } = parseOrThrow(TTSBody, req.body);
      const safeVoice: string = voice ?? "Joanna";
      const voiceId = (NEURAL_VOICES.has(safeVoice) ? safeVoice : "Joanna") as VoiceId;

      const command = new SynthesizeSpeechCommand({
        Text:         text,
        VoiceId:      voiceId,
        Engine:       Engine.NEURAL,
        OutputFormat: OutputFormat.MP3,
        TextType:     "text",
      });

      const pollyRes = await getPolly().send(command);

      if (!pollyRes.AudioStream) {
        return next(Object.assign(new Error("Polly returned no audio stream"), { status: 502 }));
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Content-Disposition", `inline; filename="tts-${Date.now()}.mp3"`);

      // AWS SDK v3 returns a web ReadableStream; wrap for Node pipe()
      const nodeStream = Readable.from(pollyRes.AudioStream as AsyncIterable<Uint8Array>);
      nodeStream.pipe(res);
      nodeStream.on("error", next);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
