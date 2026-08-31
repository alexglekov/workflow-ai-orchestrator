import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto, UpdateConnectionDto } from './dto';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  list() {
    return this.connections.list();
  }

  @Post()
  create(@Body() dto: CreateConnectionDto) {
    return this.connections.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConnectionDto) {
    return this.connections.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.connections.remove(id);
  }

  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.connections.test(id);
  }
}
