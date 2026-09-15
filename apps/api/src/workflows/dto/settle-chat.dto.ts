import { IsIn, IsOptional, IsString } from 'class-validator';

export class SettleChatDto {
  @IsIn(['ask', 'build'])
  thread!: 'ask' | 'build';

  @IsString()
  match!: string;

  @IsOptional()
  @IsString()
  rewrite?: string;

  @IsOptional()
  @IsString()
  content?: string;
}
