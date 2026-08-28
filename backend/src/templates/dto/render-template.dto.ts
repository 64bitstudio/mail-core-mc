import { IsObject } from 'class-validator';

export class RenderTemplateDto {
  @IsObject()
  variables!: Record<string, unknown>;
}
