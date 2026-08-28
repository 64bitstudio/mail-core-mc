import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const WEBHOOK_QUEUE = 'webhook-dispatch';

export interface WebhookJobData {
  messageId: string;
  event: string; // el Message.status que disparó esto (sent | failed | bounced | complained)
}

@Injectable()
export class WebhookQueueService {
  constructor(@InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<WebhookJobData>) {}

  async enqueue(messageId: string, event: string) {
    await this.queue.add(
      'dispatch',
      { messageId, event },
      {
        attempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 5),
        backoff: {
          type: 'exponential',
          delay: Number(process.env.WEBHOOK_BACKOFF_DELAY_MS ?? 2000),
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
