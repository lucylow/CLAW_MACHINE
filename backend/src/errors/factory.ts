import crypto from "node:crypto";

export function createErrorId(): string {
  return `err_${crypto.randomBytes(10).toString("hex")}`;
}
