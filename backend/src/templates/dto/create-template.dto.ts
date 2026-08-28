import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTemplateDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  htmlBody!: string;
}
