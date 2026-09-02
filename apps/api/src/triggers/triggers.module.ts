import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { RunsModule } from '../runs/runs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { TriggersRepository } from './persistence/triggers.repository';
import { TriggersController } from './triggers.controller';
import { TriggersScheduler } from './triggers.scheduler';
import { TriggersService } from './triggers.service';

@Module({
  imports: [WorkflowsModule, RunsModule, ConnectionsModule],
  controllers: [TriggersController],
  providers: [TriggersRepository, TriggersService, TriggersScheduler],
})
export class TriggersModule {}
