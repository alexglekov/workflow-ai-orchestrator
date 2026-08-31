import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { WorkflowsRepository } from './persistence/workflows.repository';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [ConnectorsModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsRepository, WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
