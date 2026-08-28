import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';

// Health check propio: @nestjs/terminus todavía no soporta Nest 12
// (peer dep tope en ^11) al momento de este ticket — forzar la
// instalación con --legacy-peer-deps hubiera arriesgado un módulo de
// salud roto silenciosamente. Esto es deliberadamente simple: ping a
// Postgres (vía Prisma) y a Redis (vía ioredis), nada más.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const result = {
      database: db.status === 'fulfilled' ? 'ok' : 'down',
      redis: redis.status === 'fulfilled' ? 'ok' : 'down',
    };

    const healthy = db.status === 'fulfilled' && redis.status === 'fulfilled';
    if (!healthy) {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  private async checkDatabase() {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async checkRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL no configurado');
    }
    const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await client.connect();
      await client.ping();
    } finally {
      client.disconnect();
    }
  }
}
