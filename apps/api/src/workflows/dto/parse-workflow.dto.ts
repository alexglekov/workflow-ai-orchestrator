import { IsString } from 'class-validator';

export class ParseWorkflowDto {
  @IsString()
  prompt!: string;
}
