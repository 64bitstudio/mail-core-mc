import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Actualizar una plantilla siempre incrementa su versión (ver
// TemplatesService.update) — no hay PATCH parcial de un solo campo sin
// subir versión, para que el historial de versiones sea confiable.
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  htmlBody?: string;
}
