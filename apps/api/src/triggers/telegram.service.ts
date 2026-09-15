import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, UnauthorizedException, forwardRef } from '@nestjs/common';
import {
  flattenTelegramInput,
  parseBusinessConnection,
  telegramCall,
  TELEGRAM_ALLOWED_UPDATES,
} from '@ai-worker/connectors';
import { ConnectionsService } from '../connections/connections.service';
import { RunsService } from '../runs/runs.service';
import { asConfig } from './lib/is-due';
import { TriggersRepository } from './persistence/triggers.repository';

export type TelegramBotHealth = {
  connectionId: string;
  name: string;
  username: string;
  state: 'connected' | 'waiting' | 'invalid';
  canReply: boolean;
  lastError: string | null;
};

export type TelegramStatus = {
  configured: boolean;
  connected: boolean;
  waiting: boolean;
  mode: 'webhook' | 'poll' | 'none';
  botUsername: string;
  canReply: boolean;
  error: string | null;
  connectionId: string | null;
  bots: TelegramBotHealth[];
};

type TelegramBotRef = {
  connectionId: string;
  botToken: string;
};

const publicApiBase = (): string =>
  (process.env['PUBLIC_API_URL'] || '').trim().replace(/\/+$/, '');

const webhookUrl = (connectionId: string): string | null => {
  const base = publicApiBase();

  if (!base.startsWith('https://')) {
    return null;
  }

  return `${base}/telegram/webhook/${connectionId}`;
};

const webhookSecret = (connectionId: string): string => {
  const seed = (process.env['ENCRYPTION_KEY'] || '').trim();

  if (!seed) {
    return '';
  }

  return createHash('sha256')
    .update(`${seed}:telegram-webhook:${connectionId}`)
    .digest('hex')
    .slice(0, 32);
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

@Injectable()
export class TelegramGatewayService {
  private readonly logger = new Logger(TelegramGatewayService.name);
  private stopped = true;
  private loop?: Promise<void>;
  private readonly webhookReady = new Set<string>();

  constructor(
    private readonly connections: ConnectionsService,
    @Inject(forwardRef(() => RunsService))
    private readonly runs: RunsService,
    private readonly triggers: TriggersRepository,
  ) {}

  hasBots = async () => {
    const bots = await this.connections.listDecrypted('telegram');

    return bots.some((bot) => Boolean(bot.credentials['botToken']));
  };

  startGateway = () => {
    if (this.loop) {
      return;
    }

    this.stopped = false;
    void this.promoteTelegramTriggers().catch(() => undefined);
    this.loop = this.runLoop().finally(() => {
      this.loop = undefined;
    });
  };

  stopGateway = () => {
    this.stopped = true;
  };

  private botInvalidMessage = (raw: string | null) => {
    if (!raw || /unauthor/i.test(raw) || /not found/i.test(raw)) {
      return 'Бот удалён или токен недействителен';
    }

    return raw;
  };

  private probeBot = async (bot: {
    connection: {
      id: string;
      name: string;
      status: string;
      lastError: string | null;
    };
    credentials: Record<string, string>;
  }): Promise<TelegramBotHealth> => {
    const token = (bot.credentials['botToken'] || '').trim();
    let username = (bot.credentials['botUsername'] || '').replace(/^@/, '');
    let tokenValid = false;
    let error = bot.connection.lastError;

    if (!token) {
      error = 'Нет токена бота';
    } else {
      try {
        const me = await telegramCall<{ username?: string }>(token, 'getMe');

        if (me.ok) {
          tokenValid = true;

          if (me.result?.username) {
            username = me.result.username;
          }
        } else {
          error = this.botInvalidMessage(me.description || error);
        }
      } catch (err) {
        error = this.botInvalidMessage(
          err instanceof Error ? err.message : error,
        );
      }
    }

    const businessConnected = Boolean(bot.credentials['businessConnectionId']);
    const businessDisabled =
      bot.connection.lastError === 'Telegram для бизнеса отключён';
    const canReply = bot.credentials['canReply'] === 'true';
    const handle = username ? `@${username}` : '';
    const name = handle ? `Telegram ${handle}` : bot.connection.name;
    const state: TelegramBotHealth['state'] = !tokenValid
      ? 'invalid'
      : businessConnected && !businessDisabled
        ? 'connected'
        : 'waiting';
    const lastError =
      state === 'invalid'
        ? error || 'Бот удалён или токен недействителен'
        : state === 'connected'
          ? null
          : businessDisabled
            ? bot.connection.lastError
            : null;
    const persistedStatus =
      state === 'connected'
        ? 'connected'
        : state === 'invalid'
          ? 'error'
          : 'disconnected';

    await this.connections.setHealth(bot.connection.id, {
      status: persistedStatus,
      lastError,
      name,
    });

    return {
      connectionId: bot.connection.id,
      name,
      username,
      state,
      canReply,
      lastError: state === 'connected' ? null : lastError,
    };
  };

  status = async (): Promise<TelegramStatus> => {
    const rows = await this.connections.listDecrypted('telegram');
    const bots = await Promise.all(
      rows
        .filter((bot) => Boolean(bot.credentials['botToken']))
        .map((bot) => this.probeBot(bot)),
    );
    const connectedBot =
      bots.find((bot) => bot.state === 'connected') ??
      bots.find((bot) => bot.state === 'waiting') ??
      bots[0];
    const tokenIds = bots.map((bot) => bot.connectionId);
    const mode: TelegramStatus['mode'] = !tokenIds.length
      ? 'none'
      : tokenIds.every((id) => this.webhookReady.has(id))
        ? 'webhook'
        : 'poll';

    return {
      configured: bots.some((bot) => bot.state !== 'invalid'),
      connected: bots.some((bot) => bot.state === 'connected'),
      waiting: bots.some((bot) => bot.state === 'waiting'),
      mode,
      botUsername: connectedBot?.username ?? '',
      canReply: connectedBot?.canReply ?? false,
      error:
        bots.find((bot) => bot.state === 'invalid')?.lastError ??
        connectedBot?.lastError ??
        null,
      connectionId: connectedBot?.connectionId ?? null,
      bots,
    };
  };

  register = async (botToken: string): Promise<TelegramStatus> => {
    await this.connections.registerTelegramBot(botToken);
    await this.promoteTelegramTriggers();
    await this.ensureWebhooks();
    await this.sync();

    return this.status();
  };

  prepare = async (): Promise<TelegramStatus> => {
    if (!(await this.hasBots())) {
      return this.status();
    }

    await this.ensureWebhooks();
    await this.sync();

    return this.status();
  };

  ensureWebhooks = async () => {
    const bots = await this.connections.listDecrypted('telegram');
    let any = false;

    for (const bot of bots) {
      const token = (bot.credentials['botToken'] || '').trim();

      if (!token) {
        continue;
      }

      if (await this.ensureWebhookFor(bot.connection.id, token)) {
        any = true;
      }
    }

    return any;
  };

  assertWebhookSecret = (
    connectionId: string,
    header: string | string[] | undefined,
  ) => {
    const expected = webhookSecret(connectionId);
    const actual = Array.isArray(header) ? header[0] : header;

    if (!expected || actual !== expected) {
      throw new UnauthorizedException('Неверный Telegram secret');
    }
  };

  handleWebhook = async (payload: unknown, connectionId: string) => {
    const bots = await this.connections.listDecrypted('telegram');
    const bot = bots.find((item) => item.connection.id === connectionId);
    const token = (bot?.credentials['botToken'] || '').trim();

    if (!token) {
      return { ok: true };
    }

    this.webhookReady.add(connectionId);
    await this.handleUpdate(payload, {
      connectionId,
      botToken: token,
    });

    return { ok: true };
  };

  sync = async () => {
    this.startGateway();
    await this.ensureWebhooks();

    return { ok: true, polling: !this.stopped };
  };

  private runLoop = async () => {
    this.logger.log('Telegram gateway: опрос входящих запущен');

    while (!this.stopped) {
      try {
        await this.ensureWebhooks();

        if (this.stopped) {
          return;
        }

        const bots = await this.connections.listDecrypted('telegram');
        const polling = bots.filter((bot) => {
          const token = (bot.credentials['botToken'] || '').trim();

          return Boolean(token) && !this.webhookReady.has(bot.connection.id);
        });

        if (!polling.length) {
          await sleep(5_000);
          continue;
        }

        for (const bot of polling) {
          if (this.stopped) {
            return;
          }

          const token = (bot.credentials['botToken'] || '').trim();

          await this.pollBot(bot.connection.id, token, bot.credentials, 25);
        }
      } catch (error) {
        this.logger.warn(
          `Telegram poll: ${
            error instanceof Error ? error.message : 'не удалось'
          }`,
        );
        await sleep(2_000);
      }
    }
  };

  private ensureWebhookFor = async (connectionId: string, token: string) => {
    const url = webhookUrl(connectionId);
    const secret = webhookSecret(connectionId);

    if (!url || !secret) {
      this.webhookReady.delete(connectionId);

      return false;
    }

    try {
      const body = await telegramCall(token, 'setWebhook', {
        url,
        secret_token: secret,
        allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
        drop_pending_updates: false,
      });

      if (!body.ok) {
        throw new Error(body.description || 'setWebhook failed');
      }

      this.webhookReady.add(connectionId);
      this.logger.log(`Telegram webhook: ${url}`);

      return true;
    } catch (error) {
      this.webhookReady.delete(connectionId);
      this.logger.warn(
        `Telegram setWebhook: ${
          error instanceof Error ? error.message : 'не удалось'
        }. Будет опрос getUpdates.`,
      );

      return false;
    }
  };

  private pollBot = async (
    connectionId: string,
    token: string,
    credentials: Record<string, string>,
    timeout = 0,
  ) => {
    const storedOffset = Number(credentials['updateOffset'] || 0) || 0;
    const request = () =>
      telegramCall<Array<Record<string, unknown>>>(token, 'getUpdates', {
        offset: storedOffset,
        timeout,
        limit: 100,
        allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
      });
    let body = await request();

    if (!body.ok) {
      const description = body.description || 'getUpdates failed';

      if (/webhook/i.test(description)) {
        const hooked = await this.ensureWebhookFor(connectionId, token);

        if (hooked) {
          return { count: 0 };
        }

        await telegramCall(token, 'deleteWebhook', {
          drop_pending_updates: false,
        }).catch(() => undefined);
        this.webhookReady.delete(connectionId);
        body = await request();
      } else if (/terminated by other getUpdates/i.test(description)) {
        this.logger.warn(
          'Telegram getUpdates: другой процесс тоже опрашивает бота. Жду и пробую снова.',
        );
        await sleep(2_000);
        body = await request();
      }

      if (!body.ok) {
        this.logger.warn(
          `Telegram getUpdates: ${body.description || description}`,
        );

        return { count: 0 };
      }
    }

    const updates = body.result ?? [];
    const origin: TelegramBotRef = { connectionId, botToken: token };

    for (const update of updates) {
      await this.handleUpdate(update, origin);
    }

    const lastId = updates.reduce((max, update) => {
      const id = Number(update['update_id'] || 0);

      return id > max ? id : max;
    }, storedOffset - 1);
    const nextOffset = lastId >= 0 ? lastId + 1 : storedOffset;

    if (nextOffset !== storedOffset) {
      await this.connections.patchCredentials(connectionId, {
        updateOffset: String(nextOffset),
      });
    }

    return { count: updates.length };
  };

  private promoteTelegramTriggers = async () => {
    const listeners = await this.triggers.listEnabledByType('telegram');

    for (const trigger of listeners) {
      const config = asConfig(trigger.config);

      if (config['delivery'] === 'push') {
        continue;
      }

      await this.triggers.update(trigger.id, {
        config: { ...config, delivery: 'push' },
      });
    }
  };

  private handleUpdate = async (
    payload: unknown,
    origin: TelegramBotRef,
  ) => {
    const business = parseBusinessConnection(payload);

    if (business) {
      await this.connections.upsertTelegramBusiness(business, origin);

      return;
    }

    const flattened = flattenTelegramInput(payload);

    if (!flattened['chatId']) {
      return;
    }

    const listeners = await this.triggers.listEnabledByType('telegram');

    if (!listeners.length) {
      this.logger.log('Telegram update without enabled event trigger');
      return;
    }

    for (const trigger of listeners) {
      try {
        await this.triggers.markFired(trigger.id, new Date());
        const run = await this.runs.start(trigger.workflowId, {
          input: flattened,
          source: 'telegram',
          triggerId: trigger.id,
        });
        this.logger.log(
          `Telegram event → workflow ${trigger.workflowId} run ${run.id}`,
        );
      } catch (error) {
        this.logger.warn(
          `Telegram trigger ${trigger.id}: ${
            error instanceof Error ? error.message : 'не удалось запустить'
          }`,
        );
      }
    }
  };
}
