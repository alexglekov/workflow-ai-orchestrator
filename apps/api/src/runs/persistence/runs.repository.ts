import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@ai-worker/data-access';

const stepsInclude = {
  steps: { orderBy: { order: 'asc' as const } },
};

const STALE_MS = 120_000;

@Injectable()
export class RunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create = (data: {
    workflowId: string;
    source?: string;
    triggerId?: string;
    input?: unknown;
    steps: Array<{
      workflowStepId: string;
      order: number;
      title: string;
      connectorId: string;
      action: string;
    }>;
  }) =>
    this.prisma.run.create({
      data: {
        workflowId: data.workflowId,
        status: 'pending',
        source: data.source ?? 'manual',
        triggerId: data.triggerId,
        input:
          data.input === undefined || data.input === null
            ? Prisma.JsonNull
            : (data.input as Prisma.InputJsonValue),
        steps: {
          create: data.steps.map((step) => ({
            ...step,
            status: 'pending',
          })),
        },
      },
      include: stepsInclude,
    });

  findById = (id: string) =>
    this.prisma.run.findUnique({
      where: { id },
      include: stepsInclude,
    });

  hasActive = async (workflowId: string) => {
    const found = await this.prisma.run.findFirst({
      where: {
        workflowId,
        cancelRequested: false,
        status: { in: ['pending', 'running'] },
      },
      select: { id: true },
    });

    return Boolean(found);
  };

  cancelActiveExcept = async (workflowId: string, exceptId: string) => {
    const pending = await this.prisma.run.findMany({
      where: {
        workflowId,
        id: { not: exceptId },
        status: 'pending',
      },
      select: { id: true },
    });

    if (pending.length > 0) {
      const ids = pending.map((item) => item.id);

      await this.prisma.run.updateMany({
        where: { id: { in: ids } },
        data: {
          cancelRequested: true,
          status: 'cancelled',
          finishedAt: new Date(),
        },
      });
      await this.prisma.runStep.updateMany({
        where: { runId: { in: ids }, status: 'pending' },
        data: {
          status: 'cancelled',
          error: 'Отменён новым запуском',
          finishedAt: new Date(),
        },
      });
    }

    await this.prisma.run.updateMany({
      where: {
        workflowId,
        id: { not: exceptId },
        status: 'running',
      },
      data: { cancelRequested: true },
    });
  };

  heartbeat = (id: string) =>
    this.prisma.run.update({
      where: { id },
      data: { lockedAt: new Date() },
    });

  requestCancel = async (id: string) => {
    const current = await this.prisma.run.findUnique({ where: { id } });

    if (!current) {
      return null;
    }

    if (!['pending', 'running'].includes(current.status)) {
      return this.prisma.run.findUnique({
        where: { id },
        include: stepsInclude,
      });
    }

    const status = current.status === 'pending' ? 'cancelled' : current.status;

    return this.prisma.run.update({
      where: { id },
      data: {
        cancelRequested: true,
        status,
        finishedAt: status === 'cancelled' ? new Date() : current.finishedAt,
      },
      include: stepsInclude,
    });
  };

  claimNext = async (workerId: string) => {
    const stale = new Date(Date.now() - STALE_MS);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Run"
        WHERE "cancelRequested" = false
          AND (
            status = 'pending'
            OR (status = 'running' AND ("lockedAt" IS NULL OR "lockedAt" < ${stale}))
          )
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      const id = rows[0]?.id;

      if (!id) {
        return null;
      }

      const current = await tx.run.findUnique({ where: { id } });

      return tx.run.update({
        where: { id },
        data: {
          status: 'running',
          lockedBy: workerId,
          lockedAt: new Date(),
          startedAt: current?.startedAt ?? new Date(),
        },
        include: stepsInclude,
      });
    });
  };

  update = (
    id: string,
    data: {
      status: string;
      startedAt?: Date;
      finishedAt?: Date;
      lockedAt?: Date | null;
      lockedBy?: string | null;
    },
  ) =>
    this.prisma.run.update({
      where: { id },
      data,
    });

  updateStep = (
    id: string,
    data: {
      status: string;
      input?: Prisma.InputJsonValue;
      output?: Prisma.InputJsonValue;
      error?: string | null;
      startedAt?: Date;
      finishedAt?: Date;
    },
  ) =>
    this.prisma.runStep.update({
      where: { id },
      data,
    });
}
