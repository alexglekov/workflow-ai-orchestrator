import { Controller, Get, Param, Post } from '@nestjs/common';
import { RunsService } from './runs.service';

@Controller()
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post('workflows/:id/runs')
  start(@Param('id') id: string) {
    return this.runs.start(id);
  }

  @Get('runs/:id')
  get(@Param('id') id: string) {
    return this.runs.get(id);
  }
}
