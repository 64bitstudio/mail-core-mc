import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { TransactionalQueueService, TRANSACTIONAL_QUEUE } from './transactional-queue.service.js';

describe('TransactionalQueueService', () => {
  let service: TransactionalQueueService;
  const queueMock = { add: vi.fn() };
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionalQueueService,
        { provide: getQueueToken(TRANSACTIONAL_QUEUE), useValue: queueMock },
      ],
    }).compile();
    service = module.get(TransactionalQueueService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('encola con jobId = messageId (dedup) y prioridad alta', async () => {
    await service.enqueue('msg-1');

    expect(queueMock.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'msg-1' },
      expect.objectContaining({ jobId: 'msg-1', priority: 1 }),
    );
  });

  it('configura backoff exponencial con un máximo de intentos (AC2)', async () => {
    process.env.TRANSACTIONAL_MAX_ATTEMPTS = '7';
    process.env.TRANSACTIONAL_BACKOFF_DELAY_MS = '3000';

    await service.enqueue('msg-1');

    expect(queueMock.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'msg-1' },
      expect.objectContaining({
        attempts: 7,
        backoff: { type: 'exponential', delay: 3000 },
      }),
    );
  });
});
