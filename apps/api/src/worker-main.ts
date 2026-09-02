import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

const bootstrap = async () => {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  app.enableShutdownHooks();
  Logger.log('Worker: очередь Run в Postgres, без HTTP и без тиков триггеров');
};

bootstrap();
