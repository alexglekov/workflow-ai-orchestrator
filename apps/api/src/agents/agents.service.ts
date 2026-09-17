import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import {
  createDefaultRegistry,
  inferScheduleIntent,
  routeChat,
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
  parseTelegramKindIntent,
  resolveTelegramKind,
  telegramKindLabel,
} from '@ai-worker/connectors';
import { scheduleIntentLabel } from '@ai-worker/workflow';
import { ConnectionsService } from '../connections/connections.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { AskAgentDto, ChatAgentDto, PlanAgentDto } from './dto';

@Injectable()
export class AgentsService {
  private readonly registry = createDefaultRegistry();

  constructor(
    private readonly connectors: ConnectorRegistryService,
    private readonly workflows: WorkflowsService,
    private readonly connections: ConnectionsService,
  ) {}

  list = () => ({
    active: 'orchestrator',
    providers: this.registry.info(),
  });

  chat = async (dto: ChatAgentDto) => {
    try {
      const message = dto.message.trim();
      const prompt = (dto.prompt || message).trim();
      const context = await this.context(dto.workflowId);
      const history = dto.workflowId
        ? await this.workflows.listChatThread(dto.workflowId, 'build')
        : dto.history;
      const route = await routeChat({
        message,
        prompt,
        history,
        context,
        requestedProvider: dto.providerId,
        availableProviderIds: this.registry
          .workers()
          .filter((agent) => agent.available())
          .map((agent) => agent.id),
      });
      const next = { ...dto, prompt, message, providerId: route.providerId };

      if (route.intent === 'ask') {
        const reply = await this.replyAsk(next, 'build');

        return {
          kind: 'questions' as const,
          providerId: reply.providerId,
          message: reply.message,
          questions: [],
          connectors: [],
          steps: [],
          intent: route.intent,
        };
      }

      return {
        ...(await this.plan({
          prompt,
          message,
          providerId: route.providerId,
          workflowId: dto.workflowId,
          history: dto.history,
        })),
        intent: route.intent,
      };
    } catch (err) {
      throw toHttpError(err);
    }
  };

  ask = async (dto: AskAgentDto) => {
    try {
      return await this.replyAsk(dto, 'ask');
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
        const current = dto.workflowId
          ? await this.workflows.get(dto.workflowId)
          : null;
        const telegramKind = resolvePlanTelegramKind({
          message,
          prompt,
          history,
          planned,
          currentSteps: current?.steps ?? [],
        });

        if (telegramKind) {
          const connectionId = current?.steps.find(
            (step) => step.connectorId === 'telegram' && step.connectionId,
          )?.connectionId;

          if (connectionId) {
            await this.connections.setTelegramKind(connectionId, telegramKind);
          }
        }

        const scheduleSource = [prompt, message].filter(Boolean).join('\n');
        const schedule = dto.workflowId
          ? await this.workflows.syncSchedule(
              dto.workflowId,
              scheduleSource,
              planned.schedule,
            )
          : planned.schedule ?? (await inferScheduleIntent(scheduleSource));
        const scheduleNote =
          schedule &&
          !/расписан|каждую минут|каждые |каждый час|ежедневн/i.test(
            planned.message,
          )
            ? `\n\nПоставил запуск ${scheduleIntentLabel(schedule)}.`
            : '';
        const kindNote =
          telegramKind &&
          !/тип telegram|обычн\w*\s+бот|бот для аккаунта/i.test(planned.message)
            ? `\n\nТип Telegram: ${telegramKindLabel(telegramKind)}${
                telegramKind === 'business'
                  ? ' — диалоги клиентов и ответы от вашего имени.'
                  : ' — отвечает в чате с ботом.'
              }`
            : '';
        const result = {
          ...planned,
          telegramKind,
          message: await this.withReadyCta(
            `${toAssistantMessage(planned)}${scheduleNote}${kindNote}`.trim(),
            current?.steps.length && planned.kind !== 'workflow'
              ? current.steps
              : planned.kind === 'workflow'
                ? planned.steps
                : [],
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
          const shouldRename =
            Boolean(result.name) &&
            (!current?.name || current.name === 'Новый workflow');
          const bound = new Map(
            (current?.steps ?? [])
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

  private replyAsk = async (
    dto: AskAgentDto | ChatAgentDto,
    thread: 'ask' | 'build',
  ) => {
    const provider = this.resolve(dto.providerId);
    const context = await this.context(dto.workflowId);
    const history = dto.workflowId
      ? await this.workflows.listChatThread(dto.workflowId, thread)
      : dto.history;
    const message = dto.message.trim();
    const current = dto.workflowId
      ? await this.workflows.get(dto.workflowId)
      : null;
    const ctaSteps = current?.steps ?? [];

    try {
      const reply = await provider.ask({
        message,
        history,
        context,
        providerId: dto.providerId,
      });
      const content = await this.withReadyCta(
        reply.message,
        ctaSteps,
        message,
      );

      if (dto.workflowId) {
        await this.workflows.appendChat(dto.workflowId, thread, [
          { role: 'user', content: message },
          { role: 'assistant', content },
        ]);
      }

      return {
        ...reply,
        message: content,
      };
    } catch (err) {
      if (dto.workflowId) {
        await this.workflows.appendChat(dto.workflowId, thread, [
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
      status: item.status,
      ...(item.connectorId === 'telegram'
        ? { telegramKind: resolveTelegramKind(item.credentials) }
        : {}),
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

const resolvePlanTelegramKind = ({
  message,
  prompt,
  history,
  planned,
  currentSteps,
}: {
  message: string;
  prompt: string;
  history?: Array<{ role: string; content: string }>;
  planned: AgentPlanResult;
  currentSteps: Array<{ connectorId: string; connectionId?: string | null }>;
}) => {
  const hasTelegram =
    currentSteps.some((step) => step.connectorId === 'telegram') ||
    planned.steps.some((step) => step.connectorId === 'telegram') ||
    planned.connectors.includes('telegram');

  if (!hasTelegram) {
    return undefined;
  }

  const bound = Boolean(
    currentSteps.some((step) => step.connectorId === 'telegram' && step.connectionId),
  );
  const parsedNow = parseTelegramKindIntent(message);

  if (parsedNow) {
    return parsedNow;
  }

  if (bound) {
    return undefined;
  }

  const earlier = [...(history ?? [])]
    .reverse()
    .filter((item) => item.role === 'user')
    .map((item) => item.content);

  for (const chunk of earlier) {
    const parsed = parseTelegramKindIntent(chunk);

    if (parsed) {
      return parsed;
    }
  }

  if (prompt !== message) {
    const fromPrompt = parseTelegramKindIntent(prompt);

    if (fromPrompt) {
      return fromPrompt;
    }
  }

  return planned.telegramKind ?? 'bot';
};
