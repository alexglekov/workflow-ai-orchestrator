import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@ai-worker/data-access';

export type TriggerType = 'schedule' | 'webhook' | 'mail' | 'telegram';

@Injectable()
export class TriggersRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByWorkflow = (workflowId: string) =>
    this.prisma.trigger.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'asc' },
    });

  findById = (id: string) =>
    this.prisma.trigger.findUnique({ where: { id } });

  findByToken = (token: string) =>
    this.prisma.trigger.findUnique({ where: { token } });

  listDue = () =>
    this.prisma.trigger.findMany({
      where: {
        enabled: true,
        type: { in: ['schedule', 'mail', 'telegram'] },
      },
    });

  create = (data: {
    workflowId: string;
    type: TriggerType;
    enabled?: boolean;
    config?: Record<string, unknown>;
  }) =>
    this.prisma.trigger.create({
      data: {
        workflowId: data.workflowId,
        type: data.type,
        enabled: data.enabled ?? true,
        config: (data.config ?? {}) as Prisma.InputJsonValue,
        token:
          data.type === 'webhook' || data.type === 'telegram'
            ? randomBytes(24).toString('hex')
            : null,
      },
    });

  update = (
    id: string,
    data: {
      enabled?: boolean;
      config?: Record<string, unknown>;
      lastFiredAt?: Date;
    },
  ) =>
    this.prisma.trigger.update({
      where: { id },
      data: {
        enabled: data.enabled,
        config: data.config
          ? (data.config as Prisma.InputJsonValue)
          : undefined,
        lastFiredAt: data.lastFiredAt,
      },
    });

  markFired = (id: string, at: Date) =>
    this.prisma.trigger.update({
      where: { id },
      data: { lastFiredAt: at },
    });

  claim = async (id: string, expectedLastFiredAt: Date | null, at: Date) => {
    const result = await this.prisma.trigger.updateMany({
      where: {
        id,
        lastFiredAt: expectedLastFiredAt,
      },
      data: { lastFiredAt: at },
    });

    return result.count === 1;
  };

  restoreFired = (id: string, lastFiredAt: Date | null) =>
    this.prisma.trigger.update({
      where: { id },
      data: { lastFiredAt },
    });

  delete = (id: string) => this.prisma.trigger.delete({ where: { id } });
}
