import { ConfigService } from '@nestjs/config';

export const encryptionKey = (config: ConfigService): string =>
  config.get<string>('ENCRYPTION_KEY') || 'dev-encryption-key-change-me';
