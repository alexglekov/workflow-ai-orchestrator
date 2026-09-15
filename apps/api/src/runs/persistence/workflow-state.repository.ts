import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@ai-worker/data-access';

@Injectable()
export class WorkflowStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  get = async (workflowId: string, key: string): Promise<unknown> => {
    const row = await this.prisma.workflowState.findUnique({
      where: { workflowId_key: { workflowId, key } },
    });

    return row?.value ?? null;
  };

  set = async (workflowId: string, key: string, value: unknown) => {
    await this.prisma.workflowState.upsert({
      where: { workflowId_key: { workflowId, key } },
      create: {
        workflowId,
        key,
        value: value as Prisma.InputJsonValue,
      },
      update: {
        value: value as Prisma.InputJsonValue,
      },
    });
  };
}
