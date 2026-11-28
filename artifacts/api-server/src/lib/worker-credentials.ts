import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);

// Staff issue a separate high-entropy credential privately; never use referral codes.
export function generateWorkerCredential(): string {
  return randomBytes(24).toString("base64url");
}
export async function hashWorkerCredential(secret: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(secret)) throw new Error("Invalid credential format");
  const salt = randomBytes(16).toString("hex");
  const digest = await derive(secret,salt,64) as Buffer;
  return "scrypt:" + salt + ":" + digest.toString("hex");
}
export async function verifyWorkerCredential(secret: unknown, stored: string): Promise<boolean> {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(secret)) return false;
  const match = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  if (!match) return false;
  const actual = await derive(secret,match[1],64) as Buffer;
  return timingSafeEqual(actual,Buffer.from(match[2],"hex"));
}
// Integration must enforce rate limits, revocation, secure sessions and staff authorization.
// No login endpoint or credential issuance is enabled by this module.
