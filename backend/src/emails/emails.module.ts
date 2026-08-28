import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TRANSACTIONAL_QUEUE, TransactionalQueueService } from './transactional-queue.service.js';
import { TransactionalProcessor } from './transactional.processor.js';
import { mailTransportProvider } from './mail-transport.provider.js';

@Module({
  imports: [BullModule.registerQueue({ name: TRANSACTIONAL_QUEUE })],
  providers: [TransactionalQueueService, TransactionalProcessor, mailTransportProvider],
  exports: [TransactionalQueueService], // el ticket 005 (API) lo necesita para encolar
})
export class EmailsModule {}
