import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { runWorkflow } from '@ai-worker/workflow';
import { ConnectionsService } from '../connections/connections.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { RunsRepository } from './persistence/runs.repository';

export type RunSource = 'manual' | 'webhook' | 'schedule' | 'mail' | 'retry';

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    private readonly runs: RunsRepository,
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

    void this.execute(run.id, workflow, options?.input ?? null);

    return this.get(run.id);
  };

  retry = async (id: string) => {
    const run = await this.get(id);

    return this.start(run.workflowId, {
      input: run.input,
      source: 'retry',
    });
  };

  get = async (id: string) => {
    const run = await this.runs.findById(id);

    if (!run) {
      throw new NotFoundException('Запуск не найден');
    }

    return run;
  };

  hasActive = (workflowId: string) => this.runs.hasActive(workflowId);

  private execute = async (
    runId: string,
    workflow: Awaited<ReturnType<WorkflowsService['get']>>,
    initialInput: unknown,
  ) => {
    await this.runs.update(runId, {
      status: 'running',
      startedAt: new Date(),
    });

    const run = await this.get(runId);

    try {
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

      await this.runs.update(runId, { status, finishedAt: new Date() });
    } catch (error) {
      this.logger.error(error);

      await this.runs.update(runId, {
        status: 'error',
        finishedAt: new Date(),
      });
    }
  };
}
