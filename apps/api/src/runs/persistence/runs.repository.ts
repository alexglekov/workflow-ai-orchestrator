import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@ai-worker/data-access';

const stepsInclude = {
  steps: { orderBy: { order: 'asc' as const } },
};

@Injectable()
export class RunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create = (data: {
    workflowId: string;
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

  update = (
    id: string,
    data: {
      status: string;
      startedAt?: Date;
      finishedAt?: Date;
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
