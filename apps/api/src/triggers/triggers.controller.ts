import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CreateTriggerDto, UpdateTriggerDto } from './dto/trigger.dto';
import { TriggersService } from './triggers.service';

const webhookUrl = (req: Request, token: string | null) => {
  if (!token) {
    return null;
  }

  const fromEnv = process.env.PUBLIC_API_URL?.trim();
  const base = fromEnv
    ? fromEnv.replace(/\/+$/, '')
    : `${req.protocol}://${req.get('host')}/api`;

  return `${base}/hooks/${token}`;
};

@Controller()
export class TriggersController {
  constructor(private readonly triggers: TriggersService) {}

  @Get('workflows/:workflowId/triggers')
  async list(@Param('workflowId') workflowId: string, @Req() req: Request) {
    const items = await this.triggers.list(workflowId);

    return items.map((item) => ({
      ...item,
      webhookUrl: webhookUrl(req, item.token),
    }));
  }

  @Post('workflows/:workflowId/triggers')
  async create(
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateTriggerDto,
    @Req() req: Request,
  ) {
    const item = await this.triggers.create(workflowId, dto);

    return { ...item, webhookUrl: webhookUrl(req, item.token) };
  }

  @Patch('triggers/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateTriggerDto) {
    return this.triggers.update(id, dto);
  }

  @Delete('triggers/:id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.triggers.remove(id);
  }

  @Post('hooks/:token')
  fire(@Param('token') token: string, @Req() req: Request) {
    return this.triggers.fireWebhook(token, req.body ?? {});
  }
}
