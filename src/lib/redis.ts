import Redis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(url, {
  lazyConnect:      true,
  connectTimeout:   5_000,
  enableReadyCheck: false,
  keepAlive:        10_000,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => (times <= 5 ? Math.min(times * 100, 2_000) : null),
  // Batches commands landing in the same event-loop tick into one round-trip
  enableAutoPipelining: true,
  autoPipeliningIgnoredCommands: ["subscribe", "psubscribe", "unsubscribe"],
  ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
});

redis.on("connect",      ()  => process.stdout.write("[redis] connected\n"));
redis.on("ready",        ()  => process.stdout.write("[redis] ready\n"));
redis.on("error",        (e) => process.stderr.write(`[redis] error: ${e.message}\n`));
redis.on("close",        ()  => process.stderr.write("[redis] connection closed\n"));
redis.on("reconnecting", ()  => process.stdout.write("[redis] reconnecting…\n"));

export function redisPipeline() {
  return redis.pipeline();
}
