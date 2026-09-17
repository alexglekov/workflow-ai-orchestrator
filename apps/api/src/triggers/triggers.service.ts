import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { flattenTelegramInput, eventTriggerTypesFromSteps } from '@ai-worker/connectors';
import { inferScheduleIntent } from '@ai-worker/agents';
import {
  clampScheduleIntent,
  type ScheduleIntent,
} from '@ai-worker/workflow';
import { RunsService } from '../runs/runs.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CreateTriggerDto, UpdateTriggerDto } from './dto/trigger.dto';
import {
  asConfig,
  DEFAULT_SCHEDULE_TZ,
  isDue,
  minutesOf,
  scheduleTimeZone,
  type TriggerType,
} from './lib/is-due';
import { TriggersRepository } from './persistence/triggers.repository';
import { TelegramGatewayService } from './telegram.service';

const resolveTimezone = (value?: string, config?: unknown): string =>
  String(value || '').trim() ||
  (config ? scheduleTimeZone(config) : '') ||
  process.env['SCHEDULE_TZ'] ||
  DEFAULT_SCHEDULE_TZ;

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);
  private ticking = false;

  constructor(
    private readonly triggers: TriggersRepository,
    @Inject(forwardRef(() => WorkflowsService))
    private readonly workflows: WorkflowsService,
    @Inject(forwardRef(() => RunsService))
    private readonly runs: RunsService,
    private readonly telegram: TelegramGatewayService,
  ) {}

  list = async (workflowId: string) => {
    const workflow = await this.workflows.get(workflowId);

    await this.syncFromSteps(workflowId, workflow.steps);

    const chat = await this.workflows.listChatThread(workflowId, 'build');
    const fromChat = chat
      .filter((item) => item.role === 'user')
      .map((item) => item.content)
      .join('\n');

    await this.syncScheduleFromPrompt(
      workflowId,
      [workflow.prompt, fromChat].filter(Boolean).join('\n'),
      { updateExisting: false },
    );

    return this.triggers.listByWorkflow(workflowId);
  };

  create = async (workflowId: string, dto: CreateTriggerDto) => {
    await this.workflows.get(workflowId);

    const config: Record<string, unknown> = {
      ...(dto.config ?? {}),
    };

    if (dto.type !== 'webhook') {
      config['everyMinutes'] = dto.everyMinutes ?? minutesOf(config, dto.type);

      if (dto.at) {
        config['at'] = dto.at;
        config['everyMinutes'] = 1440;
        config['timezone'] = resolveTimezone(dto.timezone, config);
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
      ...asConfig(current.config),
      ...(dto.config ?? {}),
    };

    if (dto.everyMinutes != null) {
      nextConfig['everyMinutes'] = dto.everyMinutes;
    }

    if (dto.at === null || dto.at === '') {
      delete nextConfig['at'];
      delete nextConfig['timezone'];
    } else if (dto.at) {
      nextConfig['at'] = dto.at;
      nextConfig['everyMinutes'] = 1440;
      nextConfig['timezone'] = resolveTimezone(dto.timezone, nextConfig);
    }

    if (dto.timezone && nextConfig['at']) {
      nextConfig['timezone'] = resolveTimezone(dto.timezone, nextConfig);
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

  syncFromSteps = async (
    workflowId: string,
    steps: Array<{ connectorId: string; action: string }>,
  ) => {
    const needed = new Set(eventTriggerTypesFromSteps(steps));
    const current = await this.triggers.listByWorkflow(workflowId);

    for (const type of needed) {
      if (current.some((item) => item.type === type)) {
        continue;
      }

      await this.triggers.create({
        workflowId,
        type,
        enabled: true,
        config:
          type === 'telegram'
            ? { delivery: 'push' }
            : { everyMinutes: minutesOf({}, type) },
      });

      if (type === 'telegram') {
        await this.telegram.ensureWebhooks();
      }
    }

    for (const item of current) {
      if (
        (item.type === 'telegram' || item.type === 'mail') &&
        !needed.has(item.type)
      ) {
        await this.triggers.delete(item.id);
      }
    }
  };

  syncScheduleFromPrompt = async (
    workflowId: string,
    text: string,
    options: { updateExisting?: boolean; hint?: unknown } = {},
  ): Promise<ScheduleIntent | null> => {
    const intent =
      clampScheduleIntent(options.hint) ?? (await inferScheduleIntent(text));

    if (!intent) {
      return null;
    }

    await this.workflows.get(workflowId);

    const current = await this.triggers.listByWorkflow(workflowId);
    const existing = current.find((item) => item.type === 'schedule');
    const config = intent.at
      ? {
          at: intent.at,
          everyMinutes: 1440,
          timezone: resolveTimezone(),
        }
      : { everyMinutes: intent.everyMinutes };

    if (existing) {
      if (options.updateExisting === false) {
        return intent;
      }

      await this.triggers.update(existing.id, {
        enabled: true,
        config,
      });
      return intent;
    }

    await this.triggers.create({
      workflowId,
      type: 'schedule',
      enabled: true,
      config,
    });

    return intent;
  };

  disableLive = async (workflowId: string) => {
    const current = await this.triggers.listByWorkflow(workflowId);
    const live = current.filter(
      (item) =>
        item.enabled &&
        (item.type === 'schedule' ||
          item.type === 'telegram' ||
          item.type === 'mail'),
    );

    for (const item of live) {
      await this.triggers.update(item.id, { enabled: false });
    }

    return live.length;
  };

  enableLive = async (workflowId: string) => {
    const current = await this.triggers.listByWorkflow(workflowId);
    const targets = current.filter(
      (item) =>
        item.type === 'schedule' ||
        item.type === 'telegram' ||
        item.type === 'mail',
    );

    for (const item of targets) {
      if (!item.enabled) {
        await this.triggers.update(item.id, { enabled: true });
      }
    }

    return targets.length;
  };

  fireWebhook = async (token: string, input: unknown) => {
    const trigger = await this.triggers.findByToken(token);

    if (
      !trigger ||
      (trigger.type !== 'webhook' && trigger.type !== 'telegram')
    ) {
      throw new NotFoundException('Webhook не найден');
    }

    if (!trigger.enabled) {
      throw new BadRequestException('Триггер выключен');
    }

    await this.triggers.markFired(trigger.id, new Date());

    const flattened = flattenTelegramInput(input);
    const payload =
      flattened['chatId']
        ? flattened
        : Array.isArray(input)
          ? { items: input }
          : input && typeof input === 'object'
            ? input
            : { payload: input };

    return this.runs.start(trigger.workflowId, {
      input: payload,
      source: trigger.type === 'telegram' ? 'telegram' : 'webhook',
      triggerId: trigger.id,
    });
  };

  tick = async () => {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      const now = new Date();
      const due = await this.triggers.listDue();

      for (const trigger of due) {
        if (trigger.type === 'telegram') {
          continue;
        }

        if (
          !isDue(
            trigger.config,
            trigger.type as TriggerType,
            trigger.lastFiredAt,
            now,
          )
        ) {
          continue;
        }

        if (await this.runs.hasActive(trigger.workflowId)) {
          continue;
        }

        const claimed = await this.triggers.claim(
          trigger.id,
          trigger.lastFiredAt,
          now,
        );

        if (!claimed) {
          continue;
        }

        try {
          await this.runs.start(trigger.workflowId, {
            input: {},
            source:
              trigger.type === 'mail'
                ? 'mail'
                : trigger.type === 'telegram'
                  ? 'telegram'
                  : 'schedule',
            triggerId: trigger.id,
          });
        } catch (error) {
          await this.triggers.restoreFired(trigger.id, trigger.lastFiredAt);
          this.logger.warn(
            `Триггер ${trigger.id}: ${
              error instanceof Error ? error.message : 'не удалось запустить'
            }`,
          );
        }
      }
    } finally {
      this.ticking = false;
    }
  };
}
