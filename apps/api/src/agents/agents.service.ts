import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createDefaultRegistry,
  sanitizePlan,
  type AgentCapability,
  type AgentContext,
  type AgentPlanResult,
  type AgentProvider,
} from '@ai-worker/agents';
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
    active: process.env['AGENT_PROVIDER'] || 'gemini',
    providers: this.registry.info(),
  });

  ask = async (dto: AskAgentDto) => {
    try {
      const provider = this.resolve(dto.providerId);
      const context = await this.context(dto.workflowId);

      return await provider.ask({
        message: dto.message.trim(),
        history: dto.history,
        context,
        providerId: dto.providerId,
      });
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
      const planned = sanitizePlan(
        await provider.plan({
          prompt,
          message,
          history: dto.history,
          context,
          providerId: dto.providerId,
        }),
        context,
      );
      const result = {
        ...planned,
        message: toAssistantMessage(planned),
      };

      if (dto.workflowId && result.kind === 'questions') {
        await this.workflows.update(dto.workflowId, { prompt });
      }

      if (dto.workflowId && result.kind === 'workflow') {
        const current = await this.workflows.get(dto.workflowId);
        const shouldRename =
          Boolean(result.name) &&
          (!current.name || current.name === 'Новый workflow');
        const workflow = await this.workflows.update(dto.workflowId, {
          prompt,
          name: shouldRename ? result.name : undefined,
          steps: result.steps,
        });

        return { ...result, workflow };
      }

      return result;
    } catch (err) {
      throw toHttpError(err);
    }
  };

  private resolve = (
    providerId?: string,
    capability: AgentCapability = 'ask',
  ): AgentProvider => {
    if (providerId && providerId !== 'orchestrator') {
      const provider = this.registry.get(providerId);

      if (!provider) {
        throw new NotFoundException(`Агент ${providerId} не найден`);
      }

      if (!provider.available()) {
        throw new BadRequestException(
          `Агент ${provider.name} недоступен. Проверьте API-ключ.`,
        );
      }

      return provider;
    }

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
        })),
      },
    };
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
