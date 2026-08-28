import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class RegisterWebhookDto {
  @IsUrl({ require_tld: false }) // require_tld:false para poder probar con http://localhost en dev
  url!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tenantId?: string;
}
