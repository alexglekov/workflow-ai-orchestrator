import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TriggersService } from './triggers.service';

@Injectable()
export class TriggersScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly triggers: TriggersService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.triggers.tick();
    }, 20_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
