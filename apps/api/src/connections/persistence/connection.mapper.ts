import { Connection } from '@prisma/client';
import { decryptJson, maskCredentials } from '@ai-worker/data-access';

export const decryptCredentials = (
  connection: Pick<Connection, 'credentialsEnc'>,
  key: string,
): Record<string, string> => {
  try {
    return decryptJson<Record<string, string>>(connection.credentialsEnc, key);
  } catch {
    return {};
  }
};

const HIDDEN_CREDENTIAL_KEYS = new Set(['updateOffset']);

export const toPublicConnection = (
  connection: Connection,
  key: string,
  secretFieldKeys: string[],
) => {
  const credentials = maskCredentials(
    decryptCredentials(connection, key),
    secretFieldKeys,
  );

  return {
    id: connection.id,
    connectorId: connection.connectorId,
    name: connection.name,
    status: connection.status,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    credentials: Object.fromEntries(
      Object.entries(credentials).filter(
        ([field]) => !HIDDEN_CREDENTIAL_KEYS.has(field),
      ),
    ),
  };
};
