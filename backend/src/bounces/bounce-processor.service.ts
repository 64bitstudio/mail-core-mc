import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebhookQueueService } from '../webhooks/webhook-queue.service.js';
import type { ParsedBounceEmail } from './dsn-parser.util.js';

@Injectable()
export class BounceProcessorService {
  private readonly logger = new Logger(BounceProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhookQueueService,
  ) {}

  async process(parsed: NonNullable<ParsedBounceEmail>): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: parsed.messageId } });
    if (!message) {
      this.logger.warn(`Bounce/complaint para un message_id desconocido: ${parsed.messageId}`);
      return;
    }

    if (parsed.type === 'complaint') {
      await this.suppress(message.recipientEmail, 'complaint');
      await this.prisma.message.update({ where: { id: message.id }, data: { status: 'complained' } });
      await this.webhooks.enqueue(message.id, 'complained');
      this.logger.warn(`Complaint recibido para el mensaje ${message.id}`);
      return;
    }

    // DSN
    if (!parsed.isPermanent) {
      // Soft bounce (4xx/delayed): NO se suprime — puede reintentarse en
      // un envío futuro, esto es solo informativo.
      this.logger.warn(`Bounce transitorio para el mensaje ${message.id}: ${parsed.statusCode}`);
      return;
    }

    await this.suppress(message.recipientEmail, 'bounce');
    await this.prisma.message.update({
      where: { id: message.id },
      data: { status: 'bounced', lastError: parsed.diagnosticCode ?? parsed.statusCode },
    });
    await this.webhooks.enqueue(message.id, 'bounced');
    this.logger.warn(`Bounce permanente para el mensaje ${message.id}: ${parsed.statusCode}`);
  }

  /**
   * Supresión GLOBAL (tenantId=null) — un hard bounce o complaint es una
   * señal sobre la dirección en sí, no algo específico de qué tenant lo
   * originó (HU-4: "aplica a cualquier tenant, no solo al que lo originó").
   */
  private async suppress(email: string, reason: 'bounce' | 'complaint') {
    const existing = await this.prisma.suppressionEntry.findFirst({ where: { email, tenantId: null } });
    if (existing) return; // ya suprimido — no duplicar
    await this.prisma.suppressionEntry.create({ data: { email, reason, tenantId: null } });
  }
}
