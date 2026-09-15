import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TriggersService } from './triggers.service';
import { TelegramGatewayService } from './telegram.service';

@Injectable()
export class TriggersScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly triggers: TriggersService,
    private readonly telegram: TelegramGatewayService,
  ) {}

  onModuleInit() {
    this.telegram.startGateway();
    void this.triggers.tick();
    this.timer = setInterval(() => {
      void this.triggers.tick();
    }, 20_000);
  }

  onModuleDestroy() {
    this.telegram.stopGateway();

    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
