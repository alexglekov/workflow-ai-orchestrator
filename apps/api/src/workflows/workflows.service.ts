import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { stripChatMarks } from '@ai-worker/connectors';
import { parsePromptToSteps, STARTER_PROMPT, starterSteps } from '@ai-worker/workflow';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { TriggersService } from '../triggers/triggers.service';
import {
  CreateWorkflowDto,
  ParseWorkflowDto,
  SettleChatDto,
  UpdateWorkflowDto,
} from './dto';
import { WorkflowChatRepository, type ChatThread } from './persistence/workflow-chat.repository';
import { WorkflowsRepository } from './persistence/workflows.repository';

const DEMO_PROMPT = STARTER_PROMPT;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly workflows: WorkflowsRepository,
    private readonly chat: WorkflowChatRepository,
    private readonly connectors: ConnectorRegistryService,
    @Inject(forwardRef(() => TriggersService))
    private readonly eventTriggers: TriggersService,
  ) {}

  list = () => this.workflows.findAll();

  get = async (id: string) => {
    const workflow = await this.workflows.findById(id);

    if (!workflow) {
      throw new NotFoundException('Workflow не найден');
    }

    return workflow;
  };

  create = async (dto: CreateWorkflowDto) => {
    const created = await this.workflows.create({
      name: dto.name || 'Новый workflow',
      prompt: dto.prompt || '',
      steps: dto.steps,
    });

    if (dto.steps?.length) {
      await this.eventTriggers.syncFromSteps(created.id, dto.steps);
    }

    if (created.prompt) {
      await this.eventTriggers.syncScheduleFromPrompt(created.id, created.prompt);
    }

    return created;
  };

  update = async (id: string, dto: UpdateWorkflowDto) => {
    await this.get(id);

    const workflow = await this.workflows.replace(id, {
      name: dto.name,
      prompt: dto.prompt,
      steps: dto.steps,
    });

    if (dto.steps) {
      await this.eventTriggers.syncFromSteps(id, dto.steps);
    }

    if (dto.prompt) {
      await this.eventTriggers.syncScheduleFromPrompt(id, dto.prompt);
    }

    return workflow;
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
        content: stripChatMarks(row.content),
      }));
  };

  appendChat = async (
    id: string,
    thread: ChatThread,
    items: Array<{
      role: 'user' | 'assistant';
      content: string;
      status?: 'error';
    }>,
  ) => {
    await this.get(id);

    return this.chat.append(id, thread, items);
  };

  settleChat = async (id: string, dto: SettleChatDto) => {
    await this.get(id);

    return this.chat.settle(id, dto.thread, dto.match, {
      rewrite: dto.rewrite,
      content: dto.content,
    });
  };

  syncSchedule = (id: string, text: string) =>
    this.eventTriggers.syncScheduleFromPrompt(id, text);

  stopLive = async (id: string) => {
    await this.get(id);

    return this.eventTriggers.disableLive(id);
  };

  startLive = async (id: string) => {
    await this.get(id);

    return this.eventTriggers.enableLive(id);
  };

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
      steps: starterSteps(),
    });
}
