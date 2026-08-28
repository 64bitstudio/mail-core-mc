import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// Wrapper inyectable sobre PrismaClient — conecta/desconecta con el ciclo
// de vida de Nest en vez de dejar la conexión abierta de forma implícita.
//
// Prisma 7 (generator "prisma-client") requiere un driver adapter
// explícito — ya no basta con la datasource url del schema/config, hay
// que pasarlo al constructor. Ver https://pris.ly/d/driver-adapters.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
