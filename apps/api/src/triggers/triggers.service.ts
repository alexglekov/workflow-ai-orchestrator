import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { flattenTelegramInput } from '@ai-worker/connectors';
import { ConnectionsService } from '../connections/connections.service';
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

const resolveTimezone = (value?: string, config?: unknown): string =>
  String(value || '').trim() ||
  (config ? scheduleTimeZone(config) : '') ||
  process.env['SCHEDULE_TZ'] ||
  DEFAULT_SCHEDULE_TZ;

const publicApiBase = (): string =>
  (process.env['PUBLIC_API_URL'] || '').trim().replace(/\/+$/, '');

const telegramWebhookUrl = (token: string): string | null => {
  const base = publicApiBase();

  if (!base.startsWith('https://')) {
    return null;
  }

  return `${base}/hooks/${token}`;
};

const setTelegramWebhook = async (botToken: string, url: string) => {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, allowed_updates: ['message', 'callback_query'] }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await response.json()) as { ok?: boolean; description?: string };

  if (!body.ok) {
    throw new Error(body.description || 'setWebhook failed');
  }
};

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);
  private ticking = false;

  constructor(
    private readonly triggers: TriggersRepository,
    private readonly workflows: WorkflowsService,
    private readonly runs: RunsService,
    private readonly connections: ConnectionsService,
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
      config['everyMinutes'] = dto.everyMinutes ?? minutesOf(config, dto.type);

      if (dto.at) {
        config['at'] = dto.at;
        config['everyMinutes'] = 1440;
        config['timezone'] = resolveTimezone(dto.timezone, config);
      }
    }

    if (dto.type === 'telegram') {
      config['delivery'] = 'poll';
    }

    const created = await this.triggers.create({
      workflowId,
      type: dto.type,
      enabled: dto.enabled,
      config,
    });

    if (dto.type === 'telegram' && created.token) {
      const hooked = await this.trySetTelegramWebhook(created.token);

      if (hooked) {
        return this.triggers.update(created.id, {
          config: { ...config, delivery: 'webhook' },
        });
      }
    }

    return created;
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

    if (current.type === 'telegram') {
      await this.clearTelegramWebhook().catch((error) => {
        this.logger.warn(
          error instanceof Error ? error.message : 'deleteWebhook failed',
        );
      });
    }

    await this.triggers.delete(id);
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
        const config = asConfig(trigger.config);

        if (trigger.type === 'telegram' && config['delivery'] === 'webhook') {
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

  private trySetTelegramWebhook = async (hookToken: string) => {
    const url = telegramWebhookUrl(hookToken);

    if (!url) {
      return false;
    }

    try {
      const found = await this.connections.resolveCredentials('telegram');
      const botToken = found.credentials['botToken'];

      if (!botToken) {
        return false;
      }

      await setTelegramWebhook(botToken, url);
      this.logger.log(`Telegram webhook: ${url}`);

      return true;
    } catch (error) {
      this.logger.warn(
        `Telegram setWebhook: ${
          error instanceof Error ? error.message : 'не удалось'
        }. Будет опрос getUpdates.`,
      );

      return false;
    }
  };

  private clearTelegramWebhook = async () => {
    const found = await this.connections.resolveCredentials('telegram');
    const botToken = found.credentials['botToken'];

    if (!botToken) {
      return;
    }

    await setTelegramWebhook(botToken, '');
  };
}
