import { ConfigService } from '@nestjs/config';

export const FALLBACK_ENCRYPTION_KEY = 'dev-encryption-key-change-me';

export const resolveEncryptionKey = (fromConfig?: string): string => {
  const key = (process.env.ENCRYPTION_KEY || fromConfig || '').trim();

  if (process.env.NODE_ENV === 'production') {
    if (!key || key === FALLBACK_ENCRYPTION_KEY) {
      throw new Error(
        'ENCRYPTION_KEY обязателен в production и не может быть дефолтным. Задайте его в .env и перезапустите api.',
      );
    }

    return key;
  }

  return key || FALLBACK_ENCRYPTION_KEY;
};

export const encryptionKey = (config: ConfigService): string =>
  resolveEncryptionKey(config.get<string>('ENCRYPTION_KEY'));
