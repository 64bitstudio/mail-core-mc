import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PassportModule } from '@nestjs/passport';
import { TRANSACTIONAL_QUEUE, TransactionalQueueService } from './transactional-queue.service.js';
import { TransactionalProcessor } from './transactional.processor.js';
import { mailTransportProvider } from './mail-transport.provider.js';
import { EmailsController } from './emails.controller.js';
import { EmailsService } from './emails.service.js';
import { TemplatesModule } from '../templates/templates.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: TRANSACTIONAL_QUEUE }),
    TemplatesModule,
    AuthModule,
    TenantsModule,
    WebhooksModule,
    // Necesario aquí también, no solo en AuthModule: @UseGuards(JwtAuthGuard)
    // en el controller de este módulo resuelve JwtAuthGuard con el
    // injector de EmailsModule, que necesita su propia visibilidad de
    // AuthModuleOptions (gotcha documentado de @nestjs/passport — cada
    // módulo que use AuthGuard() debe importar PassportModule).
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [EmailsController],
  providers: [TransactionalQueueService, TransactionalProcessor, mailTransportProvider, EmailsService],
  exports: [TransactionalQueueService],
})
export class EmailsModule {}
