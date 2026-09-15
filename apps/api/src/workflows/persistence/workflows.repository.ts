import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@ai-worker/data-access';
import { WorkflowStepInput } from './workflow-step.input';

const stepsInclude = {
  steps: { orderBy: { order: 'asc' as const } },
  triggers: { orderBy: { createdAt: 'asc' as const } },
};

const toStepCreates = (steps: WorkflowStepInput[]) =>
  steps.map((step, index) => ({
    order: index + 1,
    title: step.title,
    connectorId: step.connectorId,
    action: step.action,
    params: (step.params ?? {}) as Prisma.InputJsonValue,
    connectionId: step.connectionId || null,
    iterate: Boolean(step.iterate),
  }));

@Injectable()
export class WorkflowsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll = () =>
    this.prisma.workflow.findMany({
      include: stepsInclude,
      orderBy: { updatedAt: 'desc' },
    });

  findById = (id: string) =>
    this.prisma.workflow.findUnique({
      where: { id },
      include: stepsInclude,
    });

  create = (data: {
    name: string;
    prompt: string;
    steps?: WorkflowStepInput[];
  }) =>
    this.prisma.workflow.create({
      data: {
        name: data.name,
        prompt: data.prompt,
        steps: data.steps?.length
          ? { create: toStepCreates(data.steps) }
          : undefined,
      },
      include: stepsInclude,
    });

  replace = async (
    id: string,
    data: {
      name?: string;
      prompt?: string;
      steps?: WorkflowStepInput[];
    },
  ) => {
    if (data.steps) {
      await this.prisma.workflowStep.deleteMany({ where: { workflowId: id } });
    }

    return this.prisma.workflow.update({
      where: { id },
      data: {
        name: data.name,
        prompt: data.prompt,
        steps: data.steps ? { create: toStepCreates(data.steps) } : undefined,
      },
      include: stepsInclude,
    });
  };

  delete = (id: string) => this.prisma.workflow.delete({ where: { id } });

  deleteAll = () => this.prisma.workflow.deleteMany();
}
