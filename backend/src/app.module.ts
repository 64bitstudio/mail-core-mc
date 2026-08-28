import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EmailsModule } from './emails/emails.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL },
    }),
    EmailsModule,
    TemplatesModule,
    AuthModule,
    WebhooksModule,
    PrismaModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
