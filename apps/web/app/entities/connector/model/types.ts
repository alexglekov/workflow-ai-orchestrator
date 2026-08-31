export interface CredentialField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  type?: 'text' | 'password' | 'number' | 'select';
  options?: Array<{ value: string; label: string }>;
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
}

export interface ConnectorCatalog {
  id: string;
  name: string;
  description: string;
  credentialFields: CredentialField[];
  actions: ConnectorAction[];
}
