import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const SALT = 'ai-worker-salt-v1';

const keyFromSecret = (secret: string): Buffer => scryptSync(secret, SALT, 32);

export const encryptJson = (data: unknown, secret: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

export const decryptJson = <T>(payload: string, secret: string): T => {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), iv);

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8')) as T;
};

export const maskCredentials = (
  credentials: Record<string, string>,
  secretKeys: string[],
): Record<string, string> => {
  const masked: Record<string, string> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (!value) {
      masked[key] = '';
      continue;
    }

    if (secretKeys.includes(key)) {
      masked[key] = '********';
    } else {
      masked[key] = value;
    }
  }

  return masked;
};
