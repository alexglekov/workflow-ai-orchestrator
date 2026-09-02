import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { telegramCall } from '@ai-worker/connectors';
import { runWorkflow } from '@ai-worker/workflow';
import { ConnectionsService } from '../connections/connections.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { RunsRepository } from './persistence/runs.repository';
import { WorkflowStateRepository } from './persistence/workflow-state.repository';

export type RunSource =
  | 'manual'
  | 'webhook'
  | 'schedule'
  | 'mail'
  | 'telegram'
  | 'retry';

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);
  private readonly executing = new Set<string>();

  constructor(
    private readonly runs: RunsRepository,
    private readonly state: WorkflowStateRepository,
    private readonly workflows: WorkflowsService,
    private readonly connectors: ConnectorRegistryService,
    private readonly connections: ConnectionsService,
  ) {}

  start = async (
    workflowId: string,
    options?: {
      input?: unknown;
      source?: RunSource;
      triggerId?: string;
    },
  ) => {
    const workflow = await this.workflows.get(workflowId);

    if (workflow.steps.length === 0) {
      throw new NotFoundException('Сначала составьте шаги workflow');
    }

    const run = await this.runs.create({
      workflowId,
      source: options?.source ?? 'manual',
      triggerId: options?.triggerId,
      input: options?.input ?? null,
      steps: workflow.steps.map((step) => ({
        workflowStepId: step.id,
        order: step.order,
        title: step.title,
        connectorId: step.connectorId,
        action: step.action,
      })),
    });

    return this.get(run.id);
  };

  retry = async (id: string) => {
    const run = await this.get(id);

    return this.start(run.workflowId, {
      input: run.input,
      source: 'retry',
    });
  };

  cancel = async (id: string) => {
    const updated = await this.runs.requestCancel(id);

    if (!updated) {
      throw new NotFoundException('Запуск не найден');
    }

    return this.get(id);
  };

  get = async (id: string) => {
    const run = await this.runs.findById(id);

    if (!run) {
      throw new NotFoundException('Запуск не найден');
    }

    return run;
  };

  hasActive = (workflowId: string) => this.runs.hasActive(workflowId);

  claimNext = (workerId: string) => this.runs.claimNext(workerId);

  executeClaimed = async (runId: string) => {
    const run = await this.get(runId);
    const workflow = await this.workflows.get(run.workflowId);

    await this.execute(runId, workflow, run.input);
  };

  private execute = async (
    runId: string,
    workflow: Awaited<ReturnType<WorkflowsService['get']>>,
    initialInput: unknown,
  ) => {
    if (this.executing.has(runId)) {
      return;
    }

    this.executing.add(runId);

    const beat = setInterval(() => {
      void this.runs.heartbeat(runId).catch(() => undefined);
    }, 15_000);

    try {
      await this.runs.update(runId, {
        status: 'running',
        startedAt: new Date(),
      });

      const run = await this.get(runId);
      const status = await runWorkflow({
        steps: workflow.steps.map((step, index) => ({
          id: run.steps[index].id,
          order: step.order,
          title: step.title,
          connectorId: step.connectorId,
          action: step.action,
          params: (step.params as Record<string, unknown>) ?? {},
          connectionId: step.connectionId,
          iterate: step.iterate,
        })),
        initialInput,
        priorSteps: run.steps.map((step) => ({
          stepId: step.id,
          status: step.status,
          output: step.output,
        })),
        shouldCancel: async () => {
          const current = await this.runs.findById(runId);

          return Boolean(current?.cancelRequested);
        },
        runtime: {
          workflowId: workflow.id,
          getState: (key) => this.state.get(workflow.id, key),
          setState: (key, value) => this.state.set(workflow.id, key, value),
        },
        getConnector: (id) => this.connectors.get(id),
        getCredentials: async (connectionId, connectorId) => {
          const found = await this.connections.resolveCredentials(
            connectorId,
            connectionId,
          );

          return found.credentials;
        },
        onStepUpdate: async (update) => {
          await this.runs.updateStep(update.stepId, {
            status: update.status,
            input:
              update.input === undefined
                ? undefined
                : (update.input as Prisma.InputJsonValue),
            output:
              update.output === undefined
                ? undefined
                : (update.output as Prisma.InputJsonValue),
            error: update.error,
            startedAt: update.startedAt,
            finishedAt: update.finishedAt,
          });
        },
      });

      await this.runs.update(runId, {
        status,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      });

      if (status === 'error') {
        await this.notifyFailure(workflow.name, runId, run.source);
      }
    } catch (error) {
      this.logger.error(error);

      await this.runs.update(runId, {
        status: 'error',
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      });

      await this.notifyFailure(
        workflow.name,
        runId,
        (await this.runs.findById(runId))?.source,
      );
    } finally {
      clearInterval(beat);
      this.executing.delete(runId);
    }
  };

  private notifyFailure = async (
    workflowName: string,
    runId: string,
    source?: string | null,
  ) => {
    if (!source || !['schedule', 'mail', 'telegram'].includes(source)) {
      return;
    }

    try {
      const run = await this.get(runId);
      const failed = [...run.steps].reverse().find((step) => step.error);
      const text = [
        `Workflow «${workflowName}» упал`,
        failed?.error || 'Неизвестная ошибка',
        `run ${runId}`,
      ].join('\n');
      const found = await this.connections.resolveCredentials('telegram');
      const token = found.credentials['botToken'];
      const chatId = found.credentials['chatId'];

      if (!token || !chatId) {
        return;
      }

      const result = await telegramCall(token, 'sendMessage', {
        chat_id: chatId,
        text,
      });

      if (!result.ok) {
        this.logger.warn(result.description || 'Не удалось отправить алерт');
      }
    } catch (error) {
      this.logger.warn(
        error instanceof Error ? error.message : 'Алерт об ошибке не ушёл',
      );
    }
  };
}
