import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { WorkflowsRepository } from './persistence/workflows.repository';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [ConnectorsModule, ConnectionsModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsRepository, WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
