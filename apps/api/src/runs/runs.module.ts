import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { RunsRepository } from './persistence/runs.repository';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [ConnectorsModule, ConnectionsModule, WorkflowsModule],
  controllers: [RunsController],
  providers: [RunsRepository, RunsService],
})
export class RunsModule {}
