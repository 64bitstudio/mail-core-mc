import { Body, Controller, Get, Param, Patch, Post, UseFilters } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import { CreateTemplateDto } from './dto/create-template.dto.js';
import { UpdateTemplateDto } from './dto/update-template.dto.js';
import { RenderTemplateDto } from './dto/render-template.dto.js';
import { MissingTemplateVariableFilter } from './missing-template-variable.filter.js';

// Sin AuthN/AuthZ todavía — se resuelve en el ticket 005 (resource
// server OAuth2), fuera de alcance de este ticket (ver "No incluye").
@Controller('v1/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  // Endpoint de conveniencia para probar una plantilla sin tener que
  // pasar por el flujo completo de envío (ticket 005) — no es parte de
  // los criterios de aceptación, pero ejercita el mismo render() real.
  @Post(':id/render')
  @UseFilters(MissingTemplateVariableFilter)
  render(@Param('id') id: string, @Body() dto: RenderTemplateDto) {
    return this.templates.render(id, dto.variables);
  }
}
