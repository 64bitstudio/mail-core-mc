import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PassportModule } from '@nestjs/passport';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhookQueueService, WEBHOOK_QUEUE } from './webhook-queue.service.js';
import { WebhookProcessor } from './webhook.processor.js';
import { AuthModule } from '../auth/auth.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    AuthModule,
    TenantsModule,
    // Ver EmailsModule para el porqué (gotcha de @nestjs/passport: cada
    // módulo con @UseGuards(JwtAuthGuard) necesita su propia visibilidad
    // de AuthModuleOptions).
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookQueueService, WebhookProcessor],
  exports: [WebhookQueueService], // emails/bounces lo necesitan para notificar cambios de estado
})
export class WebhooksModule {}
