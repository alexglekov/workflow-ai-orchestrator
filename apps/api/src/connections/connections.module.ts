import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionsRepository } from './persistence/connections.repository';

@Module({
  imports: [ConnectorsModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsRepository, ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
