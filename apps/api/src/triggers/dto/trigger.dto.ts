import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTriggerDto {
  @IsIn(['schedule', 'webhook', 'mail'])
  type!: 'schedule' | 'webhook' | 'mail';

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value == null ? value : Number(value)))
  everyMinutes?: number;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @Matches(/^\d{2}:\d{2}$/)
  at?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateTriggerDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value == null ? value : Number(value)))
  everyMinutes?: number;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @Matches(/^\d{2}:\d{2}$/)
  at?: string | null;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
