import Redis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";
export const redis = new Redis(url);

redis.on("error", (e) => {
  // don't crash the app; just log
  console.error("[redis] error:", e.message);
});
