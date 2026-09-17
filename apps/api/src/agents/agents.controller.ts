import { Body, Controller, Get, Post } from '@nestjs/common';
import { AskAgentDto, ChatAgentDto, PlanAgentDto } from './dto';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list() {
    return this.agents.list();
  }

  @Post('chat')
  chat(@Body() dto: ChatAgentDto) {
    return this.agents.chat(dto);
  }

  @Post('ask')
  ask(@Body() dto: AskAgentDto) {
    return this.agents.ask(dto);
  }

  @Post('plan')
  plan(@Body() dto: PlanAgentDto) {
    return this.agents.plan(dto);
  }
}
