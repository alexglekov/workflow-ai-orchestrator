import { Module } from '@nestjs/common';
import { RunsModule } from '../runs/runs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { TriggersRepository } from './persistence/triggers.repository';
import { TriggersController } from './triggers.controller';
import { TriggersScheduler } from './triggers.scheduler';
import { TriggersService } from './triggers.service';

@Module({
  imports: [WorkflowsModule, RunsModule],
  controllers: [TriggersController],
  providers: [TriggersRepository, TriggersService, TriggersScheduler],
})
export class TriggersModule {}
