import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { WEBHOOK_QUEUE, type WebhookJobData } from './webhook-queue.service.js';
import { signWebhookPayload } from './webhook-signature.util.js';
import { isTransientWebhookError } from './webhook-error.util.js';

const WEBHOOK_TIMEOUT_MS = 10_000;

@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: job.data.messageId } });
    if (!message) {
      this.logger.warn(`Webhook para un message_id desconocido: ${job.data.messageId}`);
      return;
    }

    const subscription = await this.prisma.webhookSubscription.findUnique({
      where: { tenantId: message.tenantId },
    });
    if (!subscription) {
      return; // este tenant no tiene webhook registrado — nada que notificar
    }

    const payload = {
      messageId: message.id,
      event: job.data.event,
      recipientEmail: message.recipientEmail,
      status: message.status,
      lastError: message.lastError,
      occurredAt: new Date().toISOString(),
    };
    const payloadJson = JSON.stringify(payload);
    const signature = signWebhookPayload(payloadJson, subscription.secret);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(subscription.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': `sha256=${signature}` },
        body: payloadJson,
        signal: controller.signal,
      });
    } catch (err) {
      // Timeout (AbortError) o error de red — se trata igual que un 5xx.
      this.logger.warn(`Webhook a ${subscription.url} falló de red (intento ${job.attemptsMade + 1}): ${(err as Error).message}`);
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      return;
    }

    if (isTransientWebhookError(response.status)) {
      this.logger.warn(`Webhook a ${subscription.url} respondió ${response.status} (intento ${job.attemptsMade + 1}) — reintentando`);
      throw new Error(`Webhook respondió ${response.status}`);
    }

    // 4xx: no tiene sentido reintentar — se descarta sin relanzar.
    this.logger.warn(`Webhook a ${subscription.url} respondió ${response.status} (permanente) — no se reintenta`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookJobData>) {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return; // todavía le quedan reintentos
    }
    this.logger.error(
      `Webhook para el mensaje ${job.data.messageId} (evento ${job.data.event}) agotó sus ${maxAttempts} intentos: ${job.failedReason}`,
    );
  }
}
