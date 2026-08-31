import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [ConnectorsModule, WorkflowsModule, ConnectionsModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
