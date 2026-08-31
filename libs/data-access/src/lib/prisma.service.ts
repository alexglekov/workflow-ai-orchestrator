import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  onModuleInit = async (): Promise<void> => {
    await this.$connect();
  };

  onModuleDestroy = async (): Promise<void> => {
    await this.$disconnect();
  };
}
