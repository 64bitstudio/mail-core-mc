import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAIL_TRANSPORT } from './mail-transport.provider.js';
import { isTransientSmtpError } from './smtp-error.util.js';
import { TRANSACTIONAL_QUEUE } from './transactional-queue.service.js';
import { buildVerpAddress } from './verp.util.js';
import { WebhookQueueService } from '../webhooks/webhook-queue.service.js';

interface SendJobData {
  messageId: string;
}

@Processor(TRANSACTIONAL_QUEUE)
export class TransactionalProcessor extends WorkerHost {
  private readonly logger = new Logger(TransactionalProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
    private readonly webhooks: WebhookQueueService,
  ) {
    super();
  }

  async process(job: Job<SendJobData>) {
    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: job.data.messageId },
    });

    try {
      // envelope.from (VERP) va en el sobre SMTP real (Return-Path) —
      // distinto del header "From" visible (`from`), que sigue siendo
      // la dirección amigable de siempre. Ticket 006.
      const verpDomain = process.env.VERP_DOMAIN ?? 'mail.64bitstudio.com';
      const info = await this.transport.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: message.recipientEmail,
        subject: message.renderedSubject ?? '',
        html: message.renderedHtml ?? '',
        envelope: {
          from: buildVerpAddress(message.id, verpDomain),
          to: message.recipientEmail,
        },
      });

      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: info.messageId,
          attemptsMade: job.attemptsMade + 1,
        },
      });
      await this.webhooks.enqueue(message.id, 'sent');
      return info.messageId;
    } catch (err) {
      const errorMessage = (err as Error).message;

      if (!isTransientSmtpError(err)) {
        // Permanente (5xx): reintentar es inútil. Se marca failed y NO
        // se relanza — para BullMQ el job "completa" (no queda
        // reintentando algo que nunca va a funcionar), el estado real
        // vive en Message.status.
        this.logger.warn(`Envío ${message.id} falló permanentemente: ${errorMessage}`);
        await this.prisma.message.update({
          where: { id: message.id },
          data: { status: 'failed', lastError: errorMessage, attemptsMade: job.attemptsMade + 1 },
        });
        await this.webhooks.enqueue(message.id, 'failed');
        return null;
      }

      // Transitorio (4xx / error de red): se relanza para que BullMQ
      // reintente con el backoff configurado. onFailed (abajo) decide si
      // ya se agotaron los intentos.
      this.logger.warn(`Envío ${message.id} falló transitoriamente (intento ${job.attemptsMade + 1}): ${errorMessage}`);
      await this.prisma.message.update({
        where: { id: message.id },
        data: { attemptsMade: job.attemptsMade + 1, lastError: errorMessage },
      });
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SendJobData>) {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return; // todavía le quedan reintentos — nada más que hacer aquí
    }
    this.logger.error(
      `Envío ${job.data.messageId} agotó sus ${maxAttempts} intentos: ${job.failedReason}`,
    );
    await this.prisma.message.update({
      where: { id: job.data.messageId },
      data: { status: 'failed', lastError: job.failedReason },
    });
    await this.webhooks.enqueue(job.data.messageId, 'failed');
  }
}
