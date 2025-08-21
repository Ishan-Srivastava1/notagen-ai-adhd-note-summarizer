import { createHash } from "crypto";
export function contentHash(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
