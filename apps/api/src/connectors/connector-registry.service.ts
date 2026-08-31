import { Injectable } from '@nestjs/common';
import {
  ConnectorRegistry,
  createDefaultRegistry,
  toCatalogItem,
} from '@ai-worker/connectors';

@Injectable()
export class ConnectorRegistryService {
  private readonly registry: ConnectorRegistry = createDefaultRegistry();

  listCatalog = () => this.registry.list().map(toCatalogItem);

  get = (id: string) => this.registry.get(id);

  listConnectors = () => this.registry.list();
}
