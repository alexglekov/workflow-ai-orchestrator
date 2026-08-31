import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RunsService } from '../runs/runs.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CreateTriggerDto, UpdateTriggerDto } from './dto/trigger.dto';
import {
  TriggersRepository,
  type TriggerType,
} from './persistence/triggers.repository';

const defaultMinutes = (type: TriggerType) => (type === 'mail' ? 2 : 15);

const minutesOf = (config: unknown, type: TriggerType) => {
  const record =
    config && typeof config === 'object'
      ? (config as Record<string, unknown>)
      : {};
  const value = Number(record['everyMinutes'] || defaultMinutes(type));

  return Number.isFinite(value) && value >= 1 ? value : defaultMinutes(type);
};

const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const isDue = (
  config: unknown,
  type: TriggerType,
  lastFiredAt: Date | null,
  now: Date,
) => {
  const record =
    config && typeof config === 'object'
      ? (config as Record<string, unknown>)
      : {};
  const at = record['at'];

  if (typeof at === 'string' && /^\d{2}:\d{2}$/.test(at)) {
    const [hours, minutes] = at.split(':').map(Number);

    if (now.getHours() !== hours || now.getMinutes() !== minutes) {
      return false;
    }

    return !lastFiredAt || !sameDay(lastFiredAt, now);
  }

  const last = lastFiredAt?.getTime() ?? 0;

  return !last || now.getTime() - last >= minutesOf(config, type) * 60_000;
};

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);

  constructor(
    private readonly triggers: TriggersRepository,
    private readonly workflows: WorkflowsService,
    private readonly runs: RunsService,
  ) {}

  list = async (workflowId: string) => {
    await this.workflows.get(workflowId);

    return this.triggers.listByWorkflow(workflowId);
  };

  create = async (workflowId: string, dto: CreateTriggerDto) => {
    await this.workflows.get(workflowId);

    const config: Record<string, unknown> = {
      ...(dto.config ?? {}),
    };

    if (dto.type !== 'webhook') {
      config['everyMinutes'] =
        dto.everyMinutes ?? minutesOf(config, dto.type);

      if (dto.at) {
        config['at'] = dto.at;
        config['everyMinutes'] = 1440;
      }
    }

    return this.triggers.create({
      workflowId,
      type: dto.type,
      enabled: dto.enabled,
      config,
    });
  };

  update = async (id: string, dto: UpdateTriggerDto) => {
    const current = await this.triggers.findById(id);

    if (!current) {
      throw new NotFoundException('Триггер не найден');
    }

    const nextConfig = {
      ...((current.config as Record<string, unknown>) ?? {}),
      ...(dto.config ?? {}),
    };

    if (dto.everyMinutes != null) {
      nextConfig['everyMinutes'] = dto.everyMinutes;
    }

    if (dto.at === null || dto.at === '') {
      delete nextConfig['at'];
    } else if (dto.at) {
      nextConfig['at'] = dto.at;
      nextConfig['everyMinutes'] = 1440;
    }

    return this.triggers.update(id, {
      enabled: dto.enabled,
      config: nextConfig,
    });
  };

  remove = async (id: string) => {
    const current = await this.triggers.findById(id);

    if (!current) {
      throw new NotFoundException('Триггер не найден');
    }

    await this.triggers.delete(id);
  };

  fireWebhook = async (token: string, input: unknown) => {
    const trigger = await this.triggers.findByToken(token);

    if (!trigger || trigger.type !== 'webhook') {
      throw new NotFoundException('Webhook не найден');
    }

    if (!trigger.enabled) {
      throw new BadRequestException('Триггер выключен');
    }

    await this.triggers.markFired(trigger.id, new Date());

    return this.runs.start(trigger.workflowId, {
      input: Array.isArray(input)
        ? { items: input }
        : input && typeof input === 'object'
          ? input
          : { payload: input },
      source: 'webhook',
      triggerId: trigger.id,
    });
  };

  tick = async () => {
    const now = new Date();
    const due = await this.triggers.listDue();

    for (const trigger of due) {
      if (!isDue(trigger.config, trigger.type as TriggerType, trigger.lastFiredAt, now)) {
        continue;
      }

      if (await this.runs.hasActive(trigger.workflowId)) {
        continue;
      }

      try {
        await this.triggers.markFired(trigger.id, now);
        await this.runs.start(trigger.workflowId, {
          input: {},
          source: trigger.type === 'mail' ? 'mail' : 'schedule',
          triggerId: trigger.id,
        });
      } catch (error) {
        this.logger.warn(
          `Триггер ${trigger.id}: ${
            error instanceof Error ? error.message : 'не удалось запустить'
          }`,
        );
      }
    }
  };
}
