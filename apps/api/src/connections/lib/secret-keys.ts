import { ConnectorRegistryService } from '../../connectors/connector-registry.service';

export const secretKeys = (
  connectors: ConnectorRegistryService,
  connectorId: string,
): string[] => {
  const connector = connectors.get(connectorId);

  return (connector?.credentialFields ?? [])
    .filter((field) => field.secret)
    .map((field) => field.key);
};
