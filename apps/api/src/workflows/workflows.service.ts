import { Injectable, NotFoundException } from '@nestjs/common';
import { parsePromptToSteps, STARTER_PROMPT, starterSteps } from '@ai-worker/workflow';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import {
  CreateWorkflowDto,
  ParseWorkflowDto,
  UpdateWorkflowDto,
} from './dto';
import { WorkflowsRepository } from './persistence/workflows.repository';

const DEMO_PROMPT = STARTER_PROMPT;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly workflows: WorkflowsRepository,
    private readonly connectors: ConnectorRegistryService,
  ) {}

  list = () => this.workflows.findAll();

  get = async (id: string) => {
    const workflow = await this.workflows.findById(id);

    if (!workflow) {
      throw new NotFoundException('Workflow не найден');
    }

    return workflow;
  };

  create = (dto: CreateWorkflowDto) =>
    this.workflows.create({
      name: dto.name || 'Новый workflow',
      prompt: dto.prompt || '',
      steps: dto.steps,
    });

  update = async (id: string, dto: UpdateWorkflowDto) => {
    await this.get(id);

    return this.workflows.replace(id, {
      name: dto.name,
      prompt: dto.prompt,
      steps: dto.steps,
    });
  };

  remove = async (id: string) => {
    await this.get(id);
    await this.workflows.delete(id);
  };

  clear = () => this.workflows.deleteAll();

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

  createDemo = () =>
    this.workflows.create({
      name: 'Письма → Excel → Telegram',
      prompt: DEMO_PROMPT,
      steps: starterSteps(),
    });
}
