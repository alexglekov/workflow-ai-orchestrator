import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import type { Request } from 'express';
import { TelegramGatewayService } from './telegram.service';

class RegisterTelegramDto {
  @IsString()
  @IsNotEmpty()
  botToken!: string;
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramGatewayService) {}

  @Get('status')
  status() {
    return this.telegram.status();
  }

  @Post('register')
  register(@Body() dto: RegisterTelegramDto) {
    return this.telegram.register(dto.botToken);
  }

  @Post('prepare')
  prepare() {
    return this.telegram.prepare();
  }

  @Post('sync')
  sync() {
    return this.telegram.sync();
  }

  @Post('webhook/:connectionId')
  @HttpCode(200)
  webhook(
    @Param('connectionId') connectionId: string,
    @Req() req: Request,
    @Headers('x-telegram-bot-api-secret-token') secret?: string | string[],
  ) {
    this.telegram.assertWebhookSecret(connectionId, secret);

    return this.telegram.handleWebhook(req.body ?? {}, connectionId);
  }
}
