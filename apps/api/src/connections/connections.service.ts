import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  telegramCall,
  type TelegramBusinessConnection,
} from '@ai-worker/connectors';
import { encryptJson } from '@ai-worker/data-access';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { CreateConnectionDto, UpdateConnectionDto } from './dto';
import { encryptionKey } from './lib/encryption-key';
import { secretKeys } from './lib/secret-keys';
import {
  decryptCredentials,
  toPublicConnection,
} from './persistence/connection.mapper';
import { ConnectionsRepository } from './persistence/connections.repository';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly connectors: ConnectorRegistryService,
    private readonly config: ConfigService,
  ) {}

  private key = () => encryptionKey(this.config);

  list = async () => {
    try {
      const rows = await this.connections.findAll();

      if (!rows.length) {
        return [];
      }

      const key = this.key();

      return rows.map((row) =>
        toPublicConnection(
          row,
          key,
          secretKeys(this.connectors, row.connectorId),
        ),
      );
    } catch (err) {
      if (err instanceof InternalServerErrorException) {
        throw err;
      }

      const message =
        err instanceof Error ? err.message : 'Не удалось загрузить подключения';

      throw new InternalServerErrorException(message);
    }
  };

  create = async (dto: CreateConnectionDto) => {
    const connector = this.connectors.get(dto.connectorId);

    if (!connector) {
      throw new NotFoundException(`Коннектор ${dto.connectorId} не найден`);
    }

    const key = this.key();

    const row = await this.connections.create({
      connectorId: dto.connectorId,
      name: dto.name,
      credentialsEnc: encryptJson(dto.credentials ?? {}, key),
    });

    return toPublicConnection(
      row,
      key,
      secretKeys(this.connectors, row.connectorId),
    );
  };

  update = async (id: string, dto: UpdateConnectionDto) => {
    const existing = await this.connections.findById(id);

    if (!existing) {
      throw new NotFoundException('Подключение не найдено');
    }

    const key = this.key();
    const current = decryptCredentials(existing, key);
    const nextCredentials = { ...current };

    if (dto.credentials) {
      for (const [field, value] of Object.entries(dto.credentials)) {
        if (value && value !== '********') {
          nextCredentials[field] = value;
        }
      }
    }

    const row = await this.connections.update(id, {
      name: dto.name ?? existing.name,
      credentialsEnc: encryptJson(nextCredentials, key),
    });

    return toPublicConnection(
      row,
      key,
      secretKeys(this.connectors, row.connectorId),
    );
  };

  remove = async (id: string) => {
    const existing = await this.connections.findById(id);

    if (!existing) {
      throw new NotFoundException('Подключение не найдено');
    }

    await this.connections.delete(id);

    return { ok: true };
  };

  test = async (id: string) => {
    const existing = await this.connections.findById(id);

    if (!existing) {
      throw new NotFoundException('Подключение не найдено');
    }

    const connector = this.connectors.get(existing.connectorId);

    if (!connector) {
      throw new NotFoundException(`Коннектор ${existing.connectorId} не найден`);
    }

    const key = this.key();
    let result: { ok: boolean; message?: string; error?: string };

    try {
      result = await connector.testConnection(
        decryptCredentials(existing, key),
      );
    } catch (err) {
      result = {
        ok: false,
        error: err instanceof Error ? err.message : 'Ошибка подключения',
      };
    }

    const row = await this.connections.update(id, {
      status: result.ok ? 'connected' : 'error',
      lastError: result.ok ? null : result.error || 'Ошибка подключения',
    });

    return {
      ...toPublicConnection(
        row,
        key,
        secretKeys(this.connectors, row.connectorId),
      ),
      testMessage: result.message,
    };
  };

  soleId = async (connectorId: string) => {
    const rows = await this.connections.findByConnector(connectorId);

    return rows.length === 1 ? rows[0].id : null;
  };

  resolveCredentials = async (
    connectorId: string,
    connectionId?: string | null,
  ) => {
    const key = this.key();

    if (connectionId) {
      const row = await this.connections.findById(connectionId);

      if (!row) {
        throw new NotFoundException('Подключение шага не найдено');
      }

      return { credentials: decryptCredentials(row, key), connection: row };
    }

    const row = await this.connections.findLatestByConnector(connectorId);
    const credentials = row ? decryptCredentials(row, key) : {};

    return {
      credentials,
      connection: row,
    };
  };

  listDecrypted = async (connectorId: string) => {
    const key = this.key();
    const rows = await this.connections.findByConnector(connectorId);

    return rows.map((row) => ({
      connection: row,
      credentials: decryptCredentials(row, key),
    }));
  };

  registerTelegramBot = async (botToken: string) => {
    const token = botToken.trim();

    if (!token) {
      throw new BadRequestException('Укажите токен бота');
    }

    const me = await telegramCall<{ username?: string; first_name?: string }>(
      token,
      'getMe',
    );

    if (!me.ok) {
      throw new BadRequestException(me.description || 'Неверный токен бота');
    }

    const username = (me.result?.username || '').replace(/^@/, '');
    const key = this.key();
    const rows = await this.connections.findByConnector('telegram');
    const decrypted = rows.map((row) => ({
      row,
      creds: decryptCredentials(row, key),
    }));
    const matched = decrypted.find((item) => item.creds['botToken'] === token);
    const name = username
      ? `Telegram @${username}`
      : me.result?.first_name
        ? `Telegram ${me.result.first_name}`
        : 'Telegram бот';
    const credentials: Record<string, string> = {
      ...(matched?.creds ?? {}),
      botToken: token,
      botUsername: username,
    };
    const connected =
      matched?.row.status === 'connected' &&
      Boolean(matched.creds['businessConnectionId']);

    if (matched) {
      const row = await this.connections.update(matched.row.id, {
        name,
        credentialsEnc: encryptJson(credentials, key),
        status: connected ? 'connected' : 'disconnected',
        lastError: connected ? null : matched.row.lastError,
      });

      return toPublicConnection(
        row,
        key,
        secretKeys(this.connectors, row.connectorId),
      );
    }

    const created = await this.connections.create({
      connectorId: 'telegram',
      name,
      credentialsEnc: encryptJson(credentials, key),
    });

    return toPublicConnection(
      created,
      key,
      secretKeys(this.connectors, created.connectorId),
    );
  };

  patchCredentials = async (id: string, patch: Record<string, string>) => {
    const existing = await this.connections.findById(id);

    if (!existing) {
      throw new NotFoundException('Подключение не найдено');
    }

    const key = this.key();
    const current = decryptCredentials(existing, key);
    const row = await this.connections.update(id, {
      credentialsEnc: encryptJson({ ...current, ...patch }, key),
    });

    return toPublicConnection(
      row,
      key,
      secretKeys(this.connectors, row.connectorId),
    );
  };

  upsertTelegramBusiness = async (
    parsed: TelegramBusinessConnection,
    origin?: { connectionId?: string; botToken?: string },
  ) => {
    const key = this.key();
    const rows = await this.connections.findByConnector('telegram');
    const decrypted = rows.map((row) => ({
      row,
      creds: decryptCredentials(row, key),
    }));
    const matched =
      decrypted.find((item) => item.row.id === origin?.connectionId) ??
      decrypted.find((item) => item.creds['businessConnectionId'] === parsed.id) ??
      decrypted.find(
        (item) => origin?.botToken && item.creds['botToken'] === origin.botToken,
      );
    const credentials: Record<string, string> = {
      ...(matched?.creds ?? {}),
      ...(origin?.botToken ? { botToken: origin.botToken } : {}),
      businessConnectionId: parsed.id,
      userId: parsed.userId,
      userChatId: parsed.userChatId,
      username: parsed.username,
      firstName: parsed.firstName,
      canReply: parsed.canReply ? 'true' : 'false',
      chatId: matched?.creds['chatId'] || parsed.userChatId,
    };
    const status = parsed.isEnabled ? 'connected' : 'disconnected';
    const lastError = parsed.isEnabled
      ? null
      : 'Telegram для бизнеса отключён';
    const name = parsed.username
      ? `Telegram @${parsed.username}`
      : parsed.firstName
        ? `Telegram ${parsed.firstName}`
        : 'Telegram для бизнеса';

    if (matched) {
      const row = await this.connections.update(matched.row.id, {
        name,
        credentialsEnc: encryptJson(credentials, key),
        status,
        lastError,
      });

      return toPublicConnection(
        row,
        key,
        secretKeys(this.connectors, row.connectorId),
      );
    }

    const created = await this.connections.create({
      connectorId: 'telegram',
      name,
      credentialsEnc: encryptJson(credentials, key),
    });
    const row = await this.connections.update(created.id, {
      status,
      lastError,
    });

    return toPublicConnection(
      row,
      key,
      secretKeys(this.connectors, row.connectorId),
    );
  };

  setHealth = async (
    id: string,
    data: { status: string; lastError: string | null; name?: string },
  ) => {
    const existing = await this.connections.findById(id);

    if (!existing) {
      return null;
    }

    if (
      existing.status === data.status &&
      existing.lastError === data.lastError &&
      (data.name === undefined || existing.name === data.name)
    ) {
      return existing;
    }

    return this.connections.update(id, {
      status: data.status,
      lastError: data.lastError,
      ...(data.name ? { name: data.name } : {}),
    });
  };
}
