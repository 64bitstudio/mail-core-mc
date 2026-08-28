import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEmailDto {
  @IsUUID()
  templateId!: string;

  @IsEmail()
  to!: string;

  @IsObject()
  variables!: Record<string, unknown>;

  // Tenant de negocio del llamante (ej. el tenant de auth-core-mc que
  // originó esta acción) — string libre, no validado contra
  // auth-core-mc todavía (Fase 2). Omitido = tenant compartido del
  // ecosistema.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tenantId?: string;
}
