import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM, so a tampered ciphertext fails to decrypt rather than yielding a wrong token. The version
// prefix leaves room to rotate the scheme without guessing at stored values.
const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function assertKey(key: Uint8Array) {
  if (key.byteLength !== KEY_BYTES) throw new Error(`The token key must be ${KEY_BYTES} bytes.`);
}

/** `v1:<base64 iv>:<base64 tag>:<base64 data>`. */
export function encryptSecret(plain: string, key: Uint8Array): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(ciphertext: string, key: Uint8Array): string {
  assertKey(key);
  const [version, iv, tag, data, ...rest] = ciphertext.split(':');
  if (version !== VERSION || iv === undefined || tag === undefined || data === undefined || rest.length > 0)
    throw new Error('The stored secret is not in a format this vault reads.');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'), { authTagLength: TAG_BYTES });
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
