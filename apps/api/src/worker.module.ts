import {
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { DataAccessModule } from '@ai-worker/data-access';
import { ConnectionsModule } from './connections/connections.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { RunsModule } from './runs/runs.module';
import { RunsService } from './runs/runs.service';
import { WorkflowsModule } from './workflows/workflows.module';

@Injectable()
class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly workerId = `${hostname()}:${process.pid}`;

  constructor(private readonly runs: RunsService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 1500);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private tick = async () => {
    if (this.busy) {
      return;
    }

    this.busy = true;

    try {
      const claimed = await this.runs.claimNext(this.workerId);

      if (!claimed) {
        return;
      }

      this.logger.log(`Run ${claimed.id}`);
      await this.runs.executeClaimed(claimed.id);
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.busy = false;
    }
  };
}

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
  ],
  providers: [WorkerService],
})
export class WorkerModule {}
