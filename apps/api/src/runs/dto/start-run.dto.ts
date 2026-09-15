import { IsObject, IsOptional } from 'class-validator';

export class StartRunDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
