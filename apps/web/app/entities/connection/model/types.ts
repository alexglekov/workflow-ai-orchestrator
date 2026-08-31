export interface Connection {
  id: string;
  connectorId: string;
  name: string;
  status: string;
  lastError: string | null;
  credentials: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  testMessage?: string;
}
