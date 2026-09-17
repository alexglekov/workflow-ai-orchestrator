import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateWorkflowDto,
  ParseWorkflowDto,
  UpdateWorkflowDto,
  AppendChatDto,
  SettleChatDto,
} from './dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list() {
    return this.workflows.list();
  }

  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflows.create(dto);
  }

  @Post('demo')
  demo() {
    return this.workflows.createDemo();
  }

  @Delete()
  @HttpCode(204)
  clear() {
    return this.workflows.clear();
  }

  @Get(':id/chat')
  chat(
    @Param('id') id: string,
    @Query('thread') thread?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed =
      thread === 'ask' || thread === 'build' ? thread : undefined;
    const take = Number(limit);

    return this.workflows.listChat(id, {
      thread: parsed,
      before: before?.trim() || undefined,
      limit: Number.isFinite(take) ? take : undefined,
    });
  }

  @Post(':id/live/start')
  async startLive(@Param('id') id: string) {
    return { started: await this.workflows.startLive(id) };
  }

  @Post(':id/live/stop')
  async stopLive(@Param('id') id: string) {
    return { stopped: await this.workflows.stopLive(id) };
  }

  @Post(':id/chat/settle')
  @HttpCode(204)
  settleChat(@Param('id') id: string, @Body() dto: SettleChatDto) {
    return this.workflows.settleChat(id, dto);
  }

  @Post(':id/chat')
  appendChat(@Param('id') id: string, @Body() dto: AppendChatDto) {
    return this.workflows.appendChat(id, dto.thread, dto.messages);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.workflows.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.workflows.remove(id);
  }

  @Post(':id/parse')
  parse(@Param('id') id: string, @Body() dto: ParseWorkflowDto) {
    return this.workflows.parse(id, dto);
  }
}
