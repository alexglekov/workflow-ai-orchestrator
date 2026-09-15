import { Module, forwardRef } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { TriggersModule } from '../triggers/triggers.module';
import { WorkflowChatRepository } from './persistence/workflow-chat.repository';
import { WorkflowsRepository } from './persistence/workflows.repository';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [ConnectorsModule, forwardRef(() => TriggersModule)],
  controllers: [WorkflowsController],
  providers: [WorkflowsRepository, WorkflowChatRepository, WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
