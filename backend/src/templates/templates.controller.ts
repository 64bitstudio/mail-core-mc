import { Body, Controller, Get, Param, Patch, Post, UseFilters, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import { CreateTemplateDto } from './dto/create-template.dto.js';
import { UpdateTemplateDto } from './dto/update-template.dto.js';
import { RenderTemplateDto } from './dto/render-template.dto.js';
import { TemplateRenderFilter } from './template-render.filter.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ScopesGuard } from '../auth/scopes.guard.js';
import { RequireScopes } from '../auth/scopes.decorator.js';

// Protegido con el mismo resource server OAuth2 del ticket 005
// (ticket 010) — reutiliza mail:send tal cual, un solo scope para todo
// el módulo, sin separar admin/render (decisión explícita del Product
// Owner al cerrar este ticket, ver su sección "Hecho").
@Controller('v1/templates')
@UseGuards(JwtAuthGuard, ScopesGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  @RequireScopes('mail:send')
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Get(':id')
  @RequireScopes('mail:send')
  findOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }

  @Patch(':id')
  @RequireScopes('mail:send')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  // Endpoint de conveniencia para probar una plantilla sin tener que
  // pasar por el flujo completo de envío (ticket 005) — no es parte de
  // los criterios de aceptación, pero ejercita el mismo render() real.
  @Post(':id/render')
  @RequireScopes('mail:send')
  @UseFilters(TemplateRenderFilter)
  render(@Param('id') id: string, @Body() dto: RenderTemplateDto) {
    return this.templates.render(id, dto.variables);
  }
}
