import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    const result = await connector.testConnection(
      decryptCredentials(existing, key),
    );

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

    return {
      credentials: row ? decryptCredentials(row, key) : {},
      connection: row,
    };
  };
}
