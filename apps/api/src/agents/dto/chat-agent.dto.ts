import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AgentHistoryMessageDto } from './ask-agent.dto';

export class ChatAgentDto {
  @IsOptional()
  @IsString()
  prompt?: string;

  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  workflowId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentHistoryMessageDto)
  history?: AgentHistoryMessageDto[];
}
