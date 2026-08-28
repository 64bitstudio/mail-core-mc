import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { RegisterWebhookDto } from './dto/register-webhook.dto.js';
import { generateWebhookSecret } from './webhook-signature.util.js';

export interface RegisterWebhookResult {
  url: string;
  secret: string; // se devuelve solo en el registro — guárdalo, no se puede recuperar después
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
  ) {}

  /**
   * Un webhook por tenant (v1, simplicidad) — registrar de nuevo sobre
   * el mismo tenant reemplaza la URL y **rota el secret** (uno nuevo,
   * el anterior deja de servir) — evita quedar con dos secrets válidos
   * simultáneamente por accidente.
   */
  async register(dto: RegisterWebhookDto): Promise<RegisterWebhookResult> {
    const tenant = await this.tenants.resolveTenant(dto.tenantId);
    const secret = generateWebhookSecret();

    await this.prisma.webhookSubscription.upsert({
      where: { tenantId: tenant.id },
      update: { url: dto.url, secret },
      create: { tenantId: tenant.id, url: dto.url, secret },
    });

    return { url: dto.url, secret };
  }
}
