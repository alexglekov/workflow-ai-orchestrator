import { Controller, Get } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';

@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorRegistryService) {}

  @Get()
  catalog() {
    return this.connectors.listCatalog();
  }
}
