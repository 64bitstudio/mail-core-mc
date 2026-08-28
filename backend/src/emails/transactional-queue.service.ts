import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const TRANSACTIONAL_QUEUE = 'transactional';

// La cola en sí (BullMQ) es alcance de este ticket; el endpoint HTTP que
// llama a enqueue() es el ticket 005 — por ahora solo se ejercita desde
// tests y pruebas manuales.
@Injectable()
export class TransactionalQueueService {
  constructor(@InjectQueue(TRANSACTIONAL_QUEUE) private readonly queue: Queue) {}

  async enqueue(messageId: string) {
    // jobId = messageId: si algo encola el mismo mensaje dos veces
    // (reintento del llamante, doble clic, etc.), BullMQ deduplica en
    // vez de mandar el correo dos veces.
    await this.queue.add(
      'send',
      { messageId },
      {
        jobId: messageId,
        priority: 1, // cola de alta prioridad — HU-3
        attempts: Number(process.env.TRANSACTIONAL_MAX_ATTEMPTS ?? 5),
        backoff: {
          type: 'exponential',
          delay: Number(process.env.TRANSACTIONAL_BACKOFF_DELAY_MS ?? 2000),
        },
        removeOnComplete: true,
        removeOnFail: false, // se dejan para inspección/soporte
      },
    );
  }
}
