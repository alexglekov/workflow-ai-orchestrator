import { ConfigService } from '@nestjs/config';

export const encryptionKey = (config: ConfigService): string => {
  const key = (config.get<string>('ENCRYPTION_KEY') || '').trim();
  const fallback = 'dev-encryption-key-change-me';

  if (process.env.NODE_ENV === 'production') {
    if (!key || key === fallback) {
      throw new Error('ENCRYPTION_KEY обязателен в production и не может быть дефолтным');
    }

    return key;
  }

  return key || fallback;
};
