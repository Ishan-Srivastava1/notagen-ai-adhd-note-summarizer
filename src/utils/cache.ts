import { redis } from "../lib/redis";

export async function getCachedSummary(hash: string) {
  try {
    const v = await redis.get(`sum:${hash}`);
    return v ? JSON.parse(v) : null;
  } catch {
    return null; // fail-open
  }
}

export async function setCachedSummary(hash: string, data: any) {
  const ttl = Number(process.env.SUMMARY_TTL_SECONDS || 86400);
  try {
    await redis.set(`sum:${hash}`, JSON.stringify(data), "EX", ttl);
  } catch {
    // ignore cache set failures
  }
}
