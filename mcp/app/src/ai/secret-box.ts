import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for a secret a person handed us: their OpenRouter key. Copied from tags (shared/server/secret-box.ts).
 *
 * AES-256-GCM, so a tampered row fails to decrypt rather than decrypting to something else.
 * The key is named by the caller (`AI_KEY_ENCRYPTION_KEY`), one key per purpose: a leak of one
 * opens nothing else. It is read at call time, so a missing key fails the request that needed it,
 * not the server's boot. Every server that reads the same column must hold the same key.
 *
 * Stored as `v1.<iv>.<tag>.<ciphertext>`, base64url; the version is what makes rotation possible.
 */

const VERSION = "v1";
const IV_BYTES = 12;

function keyFrom(envName: string): Buffer {
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} is not set. Generate one with: openssl rand -base64 32`);
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${envName} must be 32 bytes, base64-encoded (got ${buf.length})`);
  return buf;
}

export function sealSecret(plaintext: string, envName: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(envName), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function openSecret(stored: string, envName: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("A stored secret is malformed");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(envName), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
