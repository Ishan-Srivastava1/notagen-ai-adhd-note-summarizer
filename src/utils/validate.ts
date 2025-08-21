import { ZodSchema } from "zod";

export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    const err = new Error(`ValidationError: ${msg}`);
    (err as any).status = 400;
    throw err;
  }
  return r.data;
}
