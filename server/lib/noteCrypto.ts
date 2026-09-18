// Per-note password locking. A note's key is derived from its password via scrypt and never
// stored -- the server persists only a salt, a verifier (so a wrong password can be rejected
// without attempting a real decrypt), and the AES-256-GCM parameters for whatever's encrypted
// under that key. Losing the password means losing the note: there is no recovery path by design.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM standard nonce size
const SALT_LEN = 16;
const VERIFIER_INFO = 'cleep-note-lock-v1';

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

export function generateSalt(): Buffer {
  return randomBytes(SALT_LEN);
}

/** scrypt is deliberately slow (well over 100ms at this cost factor) -- fine for an interactive
 *  "unlock this note" action, but callers must never run it on a bulk-read path like GET /notes. */
export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LEN);
}

/** A password-check value derived from the key, so the server can reject a wrong password with a
 *  cheap comparison instead of needing to attempt a real AES-GCM decrypt every time. */
export function computeVerifier(key: Buffer): Buffer {
  return createHmac('sha256', key).update(VERIFIER_INFO).digest();
}

export function verifyKey(key: Buffer, expectedVerifier: Buffer): boolean {
  const actual = computeVerifier(key);
  return actual.length === expectedVerifier.length && timingSafeEqual(actual, expectedVerifier);
}

export function encryptBuffer(key: Buffer, plaintext: Buffer): { iv: Buffer; ciphertext: Buffer; authTag: Buffer } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ciphertext, authTag: cipher.getAuthTag() };
}

/** Throws if the key or any of iv/ciphertext/authTag was tampered with or doesn't match --
 *  callers should treat that as a wrong password rather than a generic 500. */
export function decryptBuffer(key: Buffer, iv: Buffer, ciphertext: Buffer, authTag: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptString(key: Buffer, plaintext: string): EncryptedPayload {
  const { iv, ciphertext, authTag } = encryptBuffer(key, Buffer.from(plaintext, 'utf8'));
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: authTag.toString('base64') };
}

export function decryptString(key: Buffer, payload: EncryptedPayload): string {
  return decryptBuffer(
    key,
    Buffer.from(payload.iv, 'base64'),
    Buffer.from(payload.ciphertext, 'base64'),
    Buffer.from(payload.authTag, 'base64'),
  ).toString('utf8');
}
