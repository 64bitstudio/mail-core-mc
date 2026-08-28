import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import { RegisterWebhookDto } from './dto/register-webhook.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ScopesGuard } from '../auth/scopes.guard.js';
import { RequireScopes } from '../auth/scopes.decorator.js';

// Mismo scope que /v1/emails por ahora — separar un scope propio
// (ej. mail:admin) para gestión de webhooks es un refinamiento futuro,
// no bloqueante para este ticket.
@Controller('v1/webhooks')
@UseGuards(JwtAuthGuard, ScopesGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  @RequireScopes('mail:send')
  register(@Body() dto: RegisterWebhookDto) {
    return this.webhooks.register(dto);
  }
}
