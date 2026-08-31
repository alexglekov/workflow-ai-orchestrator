export interface CredentialFieldOption {
  value: string;
  label: string;
}

export interface CredentialField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  type?: 'text' | 'password' | 'number' | 'select';
  options?: CredentialFieldOption[];
}

export interface ConnectorActionParam {
  type: 'string' | 'number' | 'boolean' | 'object';
  required?: boolean;
  description?: string;
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  paramsSchema: Record<string, ConnectorActionParam>;
}

export interface ConnectorExecuteInput {
  action: string;
  params: Record<string, unknown>;
  previousResult: unknown;
  credentials: Record<string, string>;
}

export interface ConnectorExecuteResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  credentialFields: CredentialField[];
  actions: ConnectorAction[];
  testConnection: (
    credentials: Record<string, string>,
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  execute: (input: ConnectorExecuteInput) => Promise<ConnectorExecuteResult>;
}

export interface ConnectorCatalogItem {
  id: string;
  name: string;
  description: string;
  credentialFields: CredentialField[];
  actions: ConnectorAction[];
}

export const toCatalogItem = (connector: Connector): ConnectorCatalogItem => ({
  id: connector.id,
  name: connector.name,
  description: connector.description,
  credentialFields: connector.credentialFields,
  actions: connector.actions,
});
