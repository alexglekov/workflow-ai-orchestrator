import { IsObject, IsString } from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  connectorId!: string;

  @IsString()
  name!: string;

  @IsObject()
  credentials!: Record<string, string>;
}
