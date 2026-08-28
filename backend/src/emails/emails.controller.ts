import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseFilters, UseGuards } from '@nestjs/common';
import { EmailsService } from './emails.service.js';
import { CreateEmailDto } from './dto/create-email.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ScopesGuard } from '../auth/scopes.guard.js';
import { RequireScopes } from '../auth/scopes.decorator.js';
import { TemplateRenderFilter } from '../templates/template-render.filter.js';

@Controller('v1/emails')
@UseGuards(JwtAuthGuard, ScopesGuard)
export class EmailsController {
  constructor(private readonly emails: EmailsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireScopes('mail:send')
  @UseFilters(TemplateRenderFilter)
  send(@Body() dto: CreateEmailDto) {
    return this.emails.send(dto);
  }

  @Get(':id')
  @RequireScopes('mail:send')
  findOne(@Param('id') id: string) {
    return this.emails.findOne(id);
  }
}
