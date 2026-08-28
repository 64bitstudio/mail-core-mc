import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Tenant } from '../generated/prisma/client.js';

export const DEFAULT_TENANT_EXTERNAL_ID = '__default__';

// Compartido entre EmailsService (ticket 005) y WebhooksService (ticket
// 007) — ambos necesitan resolver el mismo tenant de negocio del
// llamante, find-or-create por external_id (ver docs/BASE_DE_DATOS.md).
@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenant(externalId: string = DEFAULT_TENANT_EXTERNAL_ID): Promise<Tenant> {
    return this.prisma.tenant.upsert({
      where: { externalId },
      update: {},
      create: { externalId, name: externalId },
    });
  }
}
