import { Injectable, NotFoundException } from '@nestjs/common';
import { parsePromptToSteps, STARTER_PROMPT, starterSteps } from '@ai-worker/workflow';
import { ConnectionsService } from '../connections/connections.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import {
  CreateWorkflowDto,
  ParseWorkflowDto,
  UpdateWorkflowDto,
} from './dto';
import { WorkflowChatRepository, type ChatThread } from './persistence/workflow-chat.repository';
import { WorkflowStepInput } from './persistence/workflow-step.input';
import { WorkflowsRepository } from './persistence/workflows.repository';

const DEMO_PROMPT = STARTER_PROMPT;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly workflows: WorkflowsRepository,
    private readonly chat: WorkflowChatRepository,
    private readonly connectors: ConnectorRegistryService,
    private readonly connections: ConnectionsService,
  ) {}

  list = () => this.workflows.findAll();

  get = async (id: string) => {
    const workflow = await this.workflows.findById(id);

    if (!workflow) {
      throw new NotFoundException('Workflow не найден');
    }

    return workflow;
  };

  create = async (dto: CreateWorkflowDto) =>
    this.workflows.create({
      name: dto.name || 'Новый workflow',
      prompt: dto.prompt || '',
      steps: dto.steps
        ? await this.bindSoleConnections(dto.steps)
        : dto.steps,
    });

  update = async (id: string, dto: UpdateWorkflowDto) => {
    await this.get(id);

    return this.workflows.replace(id, {
      name: dto.name,
      prompt: dto.prompt,
      steps: dto.steps
        ? await this.bindSoleConnections(dto.steps)
        : dto.steps,
    });
  };

  remove = async (id: string) => {
    await this.get(id);
    await this.workflows.delete(id);
  };

  clear = () => this.workflows.deleteAll();

  listChat = async (
    id: string,
    query: { thread?: ChatThread; before?: string; limit?: number } = {},
  ) => {
    await this.get(id);

    if (query.thread) {
      return this.chat.page(id, query.thread, {
        before: query.before,
        limit: query.limit,
      });
    }

    const [ask, build] = await Promise.all([
      this.chat.page(id, 'ask', { limit: query.limit }),
      this.chat.page(id, 'build', { limit: query.limit }),
    ]);

    return { ask, build };
  };

  listChatThread = async (id: string, thread: ChatThread) => {
    await this.get(id);

    const rows = await this.chat.listThread(id, thread);

    return rows
      .filter((row) => row.status !== 'error')
      .map((row) => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
      }));
  };

  appendChat = (
    id: string,
    thread: ChatThread,
    items: Array<{
      role: 'user' | 'assistant';
      content: string;
      status?: 'error';
    }>,
  ) => this.chat.append(id, thread, items);

  parse = async (id: string, dto: ParseWorkflowDto) => {
    await this.get(id);

    const steps = await parsePromptToSteps(
      dto.prompt,
      this.connectors.listConnectors(),
    );

    return this.update(id, {
      prompt: dto.prompt,
      steps,
    });
  };

  createDemo = async () =>
    this.workflows.create({
      name: 'Письма → Excel → Telegram',
      prompt: DEMO_PROMPT,
      steps: await this.bindSoleConnections(starterSteps()),
    });

  private bindSoleConnections = async (steps: WorkflowStepInput[]) => {
    const ids = [...new Set(steps.map((step) => step.connectorId))];
    const sole = new Map<string, string>();

    await Promise.all(
      ids.map(async (connectorId) => {
        const id = await this.connections.soleId(connectorId);

        if (id) {
          sole.set(connectorId, id);
        }
      }),
    );

    return steps.map((step) => {
      const current = step.connectionId?.trim();

      if (current) {
        return step;
      }

      const bound = sole.get(step.connectorId);

      return bound ? { ...step, connectionId: bound } : step;
    });
  };
}
