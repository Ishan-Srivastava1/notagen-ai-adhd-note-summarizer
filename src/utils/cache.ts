// Key TTLs:
//   sum:{sha256}            24 h  (content-addressed, safe to cache long)
//   note:{id}                5 min (invalidated on every write)
//   notes:user:{uid}:list   60 s  (busted on create/delete)
import { redis, redisPipeline } from "../lib/redis";

const SUMMARY_TTL = Number(process.env.SUMMARY_TTL_SECONDS    ?? 86_400);
const NOTE_TTL    = Number(process.env.NOTE_TTL_SECONDS        ?? 300);
const LIST_TTL    = Number(process.env.NOTES_LIST_TTL_SECONDS  ?? 60);

const DEMO_USER_ID = "demo-user";

const sumKey  = (hash: string)       => `sum:${hash}`;
const noteKey = (id: string)         => `note:${id}`;
const listKey = (uid = DEMO_USER_ID) => `notes:user:${uid}:list`;

export async function getCachedSummary(hash: string): Promise<unknown | null> {
  try {
    const v = await redis.get(sumKey(hash));
    return v ? (JSON.parse(v) as unknown) : null;
  } catch { return null; }
}

export async function setCachedSummary(hash: string, data: unknown): Promise<void> {
  try { await redis.set(sumKey(hash), JSON.stringify(data), "EX", SUMMARY_TTL); } catch {}
}

export async function getCachedNote(id: string): Promise<unknown | null> {
  try {
    const v = await redis.get(noteKey(id));
    return v ? (JSON.parse(v) as unknown) : null;
  } catch { return null; }
}

export async function setCachedNote(id: string, data: unknown): Promise<void> {
  try { await redis.set(noteKey(id), JSON.stringify(data), "EX", NOTE_TTL); } catch {}
}

export async function invalidateCachedNote(id: string): Promise<void> {
  try { await redis.del(noteKey(id)); } catch {}
}

export async function getCachedNotesList(userId = DEMO_USER_ID): Promise<unknown[] | null> {
  try {
    const v = await redis.get(listKey(userId));
    return v ? (JSON.parse(v) as unknown[]) : null;
  } catch { return null; }
}

export async function setCachedNotesList(data: unknown[], userId = DEMO_USER_ID): Promise<void> {
  try { await redis.set(listKey(userId), JSON.stringify(data), "EX", LIST_TTL); } catch {}
}

export async function invalidateCachedNotesList(userId = DEMO_USER_ID): Promise<void> {
  try { await redis.del(listKey(userId)); } catch {}
}

// Deletes note + list keys in a single round-trip
export async function invalidateNoteAndList(noteId: string, userId = DEMO_USER_ID): Promise<void> {
  try {
    const pl = redisPipeline();
    pl.del(noteKey(noteId));
    pl.del(listKey(userId));
    await pl.exec();
  } catch {}
}
