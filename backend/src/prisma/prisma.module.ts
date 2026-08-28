import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global: casi todos los módulos (emails, templates, auth, webhooks)
// necesitan la conexión a base de datos — evita reimportar PrismaModule
// en cada uno.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
