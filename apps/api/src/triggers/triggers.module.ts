import { Module, forwardRef } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { RunsModule } from '../runs/runs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { TriggersRepository } from './persistence/triggers.repository';
import { TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';
import { TelegramController } from './telegram.controller';
import { TelegramGatewayService } from './telegram.service';

@Module({
  imports: [
    forwardRef(() => WorkflowsModule),
    forwardRef(() => RunsModule),
    ConnectionsModule,
  ],
  controllers: [TriggersController, TelegramController],
  providers: [TriggersRepository, TriggersService, TelegramGatewayService],
  exports: [TelegramGatewayService, TriggersService],
})
export class TriggersModule {}
