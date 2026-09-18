import { describe, it, expect } from 'vitest';
import {
  computeVerifier,
  decryptBuffer,
  decryptString,
  deriveKey,
  encryptBuffer,
  encryptString,
  generateSalt,
  verifyKey,
} from '../server/lib/noteCrypto.js';

describe('deriveKey / computeVerifier / verifyKey', () => {
  it('derives the same key for the same password + salt', async () => {
    const salt = generateSalt();
    const a = await deriveKey('correct horse', salt);
    const b = await deriveKey('correct horse', salt);
    expect(a.equals(b)).toBe(true);
  });

  it('derives a different key for a different password or salt', async () => {
    const salt = generateSalt();
    const base = await deriveKey('correct horse', salt);
    const wrongPassword = await deriveKey('wrong password', salt);
    const wrongSalt = await deriveKey('correct horse', generateSalt());
    expect(base.equals(wrongPassword)).toBe(false);
    expect(base.equals(wrongSalt)).toBe(false);
  });

  it('accepts the right key and rejects a wrong one via the verifier', async () => {
    const salt = generateSalt();
    const key = await deriveKey('hunter2', salt);
    const verifier = computeVerifier(key);
    expect(verifyKey(key, verifier)).toBe(true);

    const wrongKey = await deriveKey('not hunter2', salt);
    expect(verifyKey(wrongKey, verifier)).toBe(false);
  });

  it('rejects a verifier of the wrong length without throwing', async () => {
    const key = await deriveKey('hunter2', generateSalt());
    expect(verifyKey(key, Buffer.from('too short'))).toBe(false);
  });
});

describe('encryptBuffer / decryptBuffer', () => {
  it('round-trips arbitrary bytes', async () => {
    const key = await deriveKey('password', generateSalt());
    const plaintext = Buffer.from('hello, this is a note body with unicode: 🎉');
    const { iv, ciphertext, authTag } = encryptBuffer(key, plaintext);
    const decrypted = decryptBuffer(key, iv, ciphertext, authTag);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('throws on a wrong key', async () => {
    const salt = generateSalt();
    const key = await deriveKey('password', salt);
    const wrongKey = await deriveKey('other password', salt);
    const { iv, ciphertext, authTag } = encryptBuffer(key, Buffer.from('secret'));
    expect(() => decryptBuffer(wrongKey, iv, ciphertext, authTag)).toThrow();
  });

  it('throws when the ciphertext has been tampered with', async () => {
    const key = await deriveKey('password', generateSalt());
    const { iv, ciphertext, authTag } = encryptBuffer(key, Buffer.from('secret'));
    const tampered = Buffer.from(ciphertext);
    tampered[0] ^= 0xff;
    expect(() => decryptBuffer(key, iv, tampered, authTag)).toThrow();
  });

  it('throws when the auth tag has been tampered with', async () => {
    const key = await deriveKey('password', generateSalt());
    const { iv, ciphertext, authTag } = encryptBuffer(key, Buffer.from('secret'));
    const tampered = Buffer.from(authTag);
    tampered[0] ^= 0xff;
    expect(() => decryptBuffer(key, iv, ciphertext, tampered)).toThrow();
  });
});

describe('encryptString / decryptString', () => {
  it('round-trips a JSON blocks payload', async () => {
    const key = await deriveKey('password', generateSalt());
    const blocks = JSON.stringify([{ id: '1', type: 'text', html: '<p>hi</p>' }]);
    const payload = encryptString(key, blocks);
    expect(decryptString(key, payload)).toBe(blocks);
  });
});
