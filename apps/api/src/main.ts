import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { resolveEncryptionKey } from './connections/lib/encryption-key';

const corsOrigins = () => {
  const raw = process.env.CORS_ORIGIN?.trim();

  if (!raw || raw === '*') {
    return true;
  }

  const patterns = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const allowed = patterns.some((pattern) => {
      if (pattern === '*' || pattern === origin) {
        return true;
      }

      if (pattern.startsWith('https://*.')) {
        const suffix = pattern.slice('https://*.'.length);

        try {
          const host = new URL(origin).hostname;

          return host === suffix || host.endsWith(`.${suffix}`);
        } catch {
          return false;
        }
      }

      return false;
    });

    callback(null, allowed);
  };
};

const bootstrap = async () => {
  if (process.env.NODE_ENV === 'production' && !process.env.API_PASSWORD?.trim()) {
    throw new Error('API_PASSWORD обязателен в production');
  }

  if (process.env.NODE_ENV === 'production') {
    resolveEncryptionKey();
  }

  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.getHttpAdapter().getInstance() as {
    set?: (key: string, value: unknown) => void;
  };

  httpAdapter.set?.('trust proxy', 1);

  app.enableCors({
    origin: corsOrigins(),
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = Number(process.env.PORT || 3000);

  await app.listen(port, '0.0.0.0');

  Logger.log(`API: http://127.0.0.1:${port}/api`);
};

bootstrap();
