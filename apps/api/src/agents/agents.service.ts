import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import {
  createDefaultRegistry,
  sanitizePlan,
  type AgentCapability,
  type AgentContext,
  type AgentPlanResult,
  type AgentProvider,
} from '@ai-worker/agents';
import {
  requiredConnectorIds,
  unresolvedConnectorIds,
  withReadyCta,
  isStopIntent,
  isLaunchIntent,
  STATUS_STOPPED_MARK,
  launchedStatusMessage,
} from '@ai-worker/connectors';
import { parseScheduleIntent, scheduleIntentLabel } from '@ai-worker/workflow';
import { ConnectionsService } from '../connections/connections.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { AskAgentDto, PlanAgentDto } from './dto';

@Injectable()
export class AgentsService {
  private readonly registry = createDefaultRegistry();

  constructor(
    private readonly connectors: ConnectorRegistryService,
    private readonly workflows: WorkflowsService,
    private readonly connections: ConnectionsService,
  ) {}

  list = () => ({
    active: 'qwen',
    providers: this.registry.info(),
  });

  ask = async (dto: AskAgentDto) => {
    try {
      const provider = this.resolve(dto.providerId);
      const context = await this.context(dto.workflowId);
      const history = dto.workflowId
        ? await this.workflows.listChatThread(dto.workflowId, 'ask')
        : dto.history;
      const message = dto.message.trim();

      try {
        const reply = await provider.ask({
          message,
          history,
          context,
          providerId: dto.providerId,
        });

        if (dto.workflowId) {
          await this.workflows.appendChat(dto.workflowId, 'ask', [
            { role: 'user', content: message },
            {
              role: 'assistant',
              content: await this.withReadyCta(reply.message, [], message),
            },
          ]);
        }

        return {
          ...reply,
          message: await this.withReadyCta(reply.message, [], message),
        };
      } catch (err) {
        if (dto.workflowId) {
          await this.workflows.appendChat(dto.workflowId, 'ask', [
            { role: 'user', content: message },
            {
              role: 'assistant',
              content:
                err instanceof Error ? err.message : 'Не удалось спросить агента',
              status: 'error',
            },
          ]);
        }

        throw err;
      }
    } catch (err) {
      throw toHttpError(err);
    }
  };

  plan = async (dto: PlanAgentDto) => {
    try {
      const provider = this.resolve(dto.providerId, 'plan');
      const context = await this.context(dto.workflowId);

      if (!provider.plan) {
        throw new BadRequestException(
          `Агент ${provider.name} не умеет собирать workflow`,
        );
      }

      const prompt = dto.prompt.trim();
      const message = (dto.message || dto.prompt).trim();

      if (dto.workflowId && isStopIntent(message)) {
        await this.workflows.stopLive(dto.workflowId);
        const content = `Остановлено.\n${STATUS_STOPPED_MARK}`;

        await this.workflows.appendChat(dto.workflowId, 'build', [
          { role: 'user', content: message },
          { role: 'assistant', content },
        ]);

        return {
          kind: 'questions',
          providerId: provider.id,
          message: content,
          questions: [],
          connectors: [],
          steps: [],
        };
      }

      if (dto.workflowId && isLaunchIntent(message)) {
        const started = await this.workflows.startLive(dto.workflowId);

        if (started > 0) {
          const content = launchedStatusMessage();

          await this.workflows.appendChat(dto.workflowId, 'build', [
            { role: 'user', content: message },
            { role: 'assistant', content },
          ]);

          return {
            kind: 'questions',
            providerId: provider.id,
            message: content,
            questions: [],
            connectors: [],
            steps: [],
          };
        }
      }
      const history = dto.workflowId
        ? await this.workflows.listChatThread(dto.workflowId, 'build')
        : dto.history;

      try {
        const planned = sanitizePlan(
          await provider.plan({
            prompt,
            message,
            history,
            context,
            providerId: dto.providerId,
          }),
          context,
        );
        const scheduleSource = [prompt, message].filter(Boolean).join('\n');
        const schedule = dto.workflowId
          ? await this.workflows.syncSchedule(dto.workflowId, scheduleSource)
          : parseScheduleIntent(scheduleSource);
        const scheduleNote =
          schedule &&
          !/расписан|каждую минут|каждые |каждый час|ежедневн/i.test(
            planned.message,
          )
            ? `\n\nПоставил запуск ${scheduleIntentLabel(schedule)}.`
            : '';
        const result = {
          ...planned,
          message: await this.withReadyCta(
            `${toAssistantMessage(planned)}${scheduleNote}`.trim(),
            planned.kind === 'workflow' ? planned.steps : [],
            prompt,
            message,
            ...(planned.connectors ?? []),
            ...(planned.steps ?? []).map((step) => step.connectorId),
          ),
        };

        if (dto.workflowId) {
          await this.workflows.appendChat(dto.workflowId, 'build', [
            { role: 'user', content: message },
            { role: 'assistant', content: result.message },
          ]);
        }

        if (dto.workflowId && result.kind === 'questions') {
          await this.workflows.update(dto.workflowId, { prompt });
        }

        if (dto.workflowId && result.kind === 'workflow') {
          const current = await this.workflows.get(dto.workflowId);
          const shouldRename =
            Boolean(result.name) &&
            (!current.name || current.name === 'Новый workflow');
          const bound = new Map(
            current.steps
              .filter((step) => step.connectionId)
              .map((step) => [step.connectorId, step.connectionId]),
          );
          const steps = result.steps.map((step) => ({
            ...step,
            connectionId: bound.get(step.connectorId) || null,
          }));
          const workflow = await this.workflows.update(dto.workflowId, {
            prompt,
            name: shouldRename ? result.name : undefined,
            steps,
          });

          return { ...result, workflow };
        }

        return result;
      } catch (err) {
        if (dto.workflowId) {
          await this.workflows.appendChat(dto.workflowId, 'build', [
            { role: 'user', content: message },
            {
              role: 'assistant',
              content:
                err instanceof Error
                  ? err.message
                  : 'Не удалось составить workflow',
              status: 'error',
            },
          ]);
        }

        throw err;
      }
    } catch (err) {
      throw toHttpError(err);
    }
  };

  private resolve = (
    providerId?: string,
    capability: AgentCapability = 'ask',
  ): AgentProvider => {
    return this.registry.resolve(capability, providerId);
  };

  private context = async (workflowId?: string): Promise<AgentContext> => {
    const connectors = this.connectors.listConnectors().map((connector) => ({
      id: connector.id,
      name: connector.name,
      description: connector.description,
      actions: connector.actions.map((action) => ({
        id: action.id,
        name: action.name,
        description: action.description,
        params: action.paramsSchema,
      })),
    }));
    const connections = (await this.connections.list()).map((item) => ({
      name: item.name,
      connectorId: item.connectorId,
    }));

    if (!workflowId) {
      return { connectors, connections };
    }

    const workflow = await this.workflows.get(workflowId);

    return {
      connectors,
      connections,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        prompt: workflow.prompt,
        steps: workflow.steps.map((step) => ({
          title: step.title,
          connectorId: step.connectorId,
          action: step.action,
          connectionId: step.connectionId,
        })),
      },
    };
  };

  private withReadyCta = async (
    message: string,
    steps: Array<{ connectorId: string; connectionId?: string | null }>,
    ...signals: string[]
  ) => {
    const connections = await this.connections.list();
    const fromSteps = requiredConnectorIds(steps);
    const fromSignals =
      fromSteps.includes('telegram') ||
      signals.some(
        (item) => item === 'telegram' || /телеграм|telegram/i.test(item),
      )
        ? ['telegram']
        : [];
    const required = [...new Set([...fromSteps, ...fromSignals])];
    const bindings =
      required.length === 0
        ? steps
        : required.flatMap((id) => {
            const bound = steps.filter((step) => step.connectorId === id);

            return bound.length ? bound : [{ connectorId: id, connectionId: null }];
          });
    const missing = unresolvedConnectorIds(bindings, connections);

    return withReadyCta(
      message,
      missing,
      fromSteps.length > 0 && missing.length === 0,
    );
  };
}

const toHttpError = (err: unknown) => {
  if (err instanceof HttpException) {
    return err;
  }

  const message =
    err instanceof Error ? err.message : 'Не удалось обратиться к агенту';

  return new BadGatewayException(message);
};

const toAssistantMessage = (plan: AgentPlanResult): string => {
  if (plan.kind !== 'questions' || plan.questions.length === 0) {
    return plan.message;
  }

  const list = plan.questions
    .map((question, index) => `${index + 1}. ${question}`)
    .join('\n');

  if (plan.questions.every((question) => plan.message.includes(question))) {
    return plan.message;
  }

  return plan.message ? `${plan.message}\n\n${list}` : list;
};
