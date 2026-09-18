import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@ai-worker/data-access';
import { WorkflowStepInput } from './workflow-step.input';

const stepsInclude = {
  steps: { orderBy: { order: 'asc' as const } },
  triggers: { orderBy: { createdAt: 'asc' as const } },
};

const stepSignature = (step: WorkflowStepInput) =>
  JSON.stringify([
    step.connectorId,
    step.action,
    step.params ?? {},
    step.connectionId || null,
    Boolean(step.iterate),
  ]);

/**
 * Последний барьер против дублей: одна и та же цепочка иногда приходит дважды
 * (LLM копирует текущий workflow, повторные/гоночные сохранения из чата). На
 * уровне записи гарантируем, что в БД не окажется одинаковых шагов.
 */
const dedupeStepInputs = (steps: WorkflowStepInput[]): WorkflowStepInput[] => {
  let list = steps;

  // Полное удвоение (ABCD ABCD) — берём только первую половину.
  if (list.length >= 2 && list.length % 2 === 0) {
    const mid = list.length / 2;
    const doubled = list
      .slice(0, mid)
      .every((step, index) => stepSignature(step) === stepSignature(list[mid + index]));

    if (doubled) {
      list = list.slice(0, mid);
    }
  }

  // Точечные повторы (AABBCC…) — оставляем первое вхождение каждого шага.
  const seen = new Set<string>();

  return list.filter((step) => {
    const key = stepSignature(step);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
};

const toStepCreates = (steps: WorkflowStepInput[]) =>
  dedupeStepInputs(steps).map((step, index) => ({
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
    const updateData = {
      name: data.name,
      prompt: data.prompt,
      steps: data.steps ? { create: toStepCreates(data.steps) } : undefined,
    };

    // Удаление старых шагов и запись новых — одной транзакцией, чтобы
    // параллельные сохранения не могли переплестись и наплодить дубли.
    if (!data.steps) {
      return this.prisma.workflow.update({
        where: { id },
        data: updateData,
        include: stepsInclude,
      });
    }

    const [, workflow] = await this.prisma.$transaction([
      this.prisma.workflowStep.deleteMany({ where: { workflowId: id } }),
      this.prisma.workflow.update({
        where: { id },
        data: updateData,
        include: stepsInclude,
      }),
    ]);

    return workflow;
  };

  delete = (id: string) => this.prisma.workflow.delete({ where: { id } });

  deleteAll = () => this.prisma.workflow.deleteMany();
}
