import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { StartRunDto } from './dto/start-run.dto';
import { RunsService } from './runs.service';

@Controller()
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post('workflows/:id/runs')
  start(@Param('id') id: string, @Body() dto: StartRunDto) {
    return this.runs.start(id, {
      input: dto?.input ?? {},
      source: 'manual',
    });
  }

  @Post('runs/:id/retry')
  retry(@Param('id') id: string) {
    return this.runs.retry(id);
  }

  @Post('runs/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.runs.cancel(id);
  }

  @Get('runs/:id')
  get(@Param('id') id: string) {
    return this.runs.get(id);
  }
}
