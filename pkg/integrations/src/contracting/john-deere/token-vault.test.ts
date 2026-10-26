import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './token-vault.js';

const key = randomBytes(32);

it('round-trips a secret under a fresh IV each time', () => {
  const first = encryptSecret('refresh-token', key);
  const second = encryptSecret('refresh-token', key);
  expect(first).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
  expect(first).not.toBe(second);
  expect(decryptSecret(first, key)).toBe('refresh-token');
  expect(decryptSecret(second, key)).toBe('refresh-token');
});

it('refuses a tampered ciphertext, a wrong key and a foreign format', () => {
  const [version, iv, tag, data] = encryptSecret('refresh-token', key).split(':');
  const flipped = Buffer.from(data ?? '', 'base64');
  flipped[0] = (flipped[0] ?? 0) ^ 1;
  expect(() => decryptSecret([version, iv, tag, flipped.toString('base64')].join(':'), key)).toThrow();
  expect(() => decryptSecret(encryptSecret('refresh-token', key), randomBytes(32))).toThrow();
  expect(() => decryptSecret('plain-token', key)).toThrow(/format/);
  expect(() => encryptSecret('refresh-token', randomBytes(16))).toThrow(/32 bytes/);
});
