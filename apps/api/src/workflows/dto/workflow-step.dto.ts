import { IsObject, IsOptional, IsString } from 'class-validator';

export class WorkflowStepDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  title!: string;

  @IsString()
  connectorId!: string;

  @IsString()
  action!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  connectionId?: string;
}
