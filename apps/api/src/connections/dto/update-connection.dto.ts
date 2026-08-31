import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateConnectionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;
}
