import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateWorkflowDto,
  ParseWorkflowDto,
  UpdateWorkflowDto,
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
