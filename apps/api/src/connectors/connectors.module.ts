import { Module } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';
import { ConnectorsController } from './connectors.controller';

@Module({
  controllers: [ConnectorsController],
  providers: [ConnectorRegistryService],
  exports: [ConnectorRegistryService],
})
export class ConnectorsModule {}
