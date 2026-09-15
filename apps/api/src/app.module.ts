import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { DataAccessModule } from '@ai-worker/data-access';
import { AgentsModule } from './agents/agents.module';
import { AuthController } from './auth/auth.controller';
import { ApiPasswordGuard } from './auth/api-password.guard';
import { ConnectionsModule } from './connections/connections.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { HealthController } from './health/health.controller';
import { RunsModule } from './runs/runs.module';
import { TriggersModule } from './triggers/triggers.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '.env'),
        join(__dirname, '../../../.env'),
        join(__dirname, '../../../../.env'),
      ],
    }),
    DataAccessModule,
    ConnectorsModule,
    ConnectionsModule,
    WorkflowsModule,
    RunsModule,
    AgentsModule,
    TriggersModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiPasswordGuard,
    },
  ],
})
export class AppModule {}
