import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';
import { WebhookProcessor } from './webhook.processor.js';

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  const prismaMock = {
    message: { findUnique: vi.fn() },
    webhookSubscription: { findUnique: vi.fn() },
  };

  const message = {
    id: 'msg-1',
    tenantId: 'tenant-1',
    recipientEmail: 'a@test.com',
    status: 'sent',
    lastError: null,
  };
  const subscription = { tenantId: 'tenant-1', url: 'https://callback.test/hook', secret: 'sh-secret' };

  function makeJob(attemptsMade = 0, attempts = 5): Job<{ messageId: string; event: string }> {
    return { data: { messageId: 'msg-1', event: 'sent' }, attemptsMade, opts: { attempts } } as unknown as Job<{
      messageId: string;
      event: string;
    }>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new WebhookProcessor(prismaMock as never);
    prismaMock.message.findUnique.mockResolvedValue(message);
    prismaMock.webhookSubscription.findUnique.mockResolvedValue(subscription);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no hace nada si el tenant no tiene webhook registrado', async () => {
    prismaMock.webhookSubscription.findUnique.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await processor.process(makeJob());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hace POST con la firma correcta cuando hay un webhook registrado (AC1/AC3)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await processor.process(makeJob());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://callback.test/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Signature': expect.stringMatching(/^sha256=[0-9a-f]{64}$/) }),
      }),
    );
  });

  it('relanza el error ante un 5xx del receptor para que BullMQ reintente (AC2)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(processor.process(makeJob())).rejects.toThrow();
  });

  it('NO relanza ante un 4xx del receptor (permanente, no tiene caso reintentar)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(processor.process(makeJob())).resolves.toBeUndefined();
  });

  it('relanza ante un error de red/timeout (AC2)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network fail')));

    await expect(processor.process(makeJob())).rejects.toThrow('network fail');
  });

  describe('onFailed', () => {
    it('no hace nada si todavía quedan reintentos', () => {
      const loggerErrorSpy = vi.spyOn(processor['logger'], 'error');
      processor.onFailed(makeJob(2, 5));
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('loguea error cuando se agotan los intentos (AC2)', () => {
      const loggerErrorSpy = vi.spyOn(processor['logger'], 'error');
      const job = { ...makeJob(5, 5), failedReason: 'timeout' } as Job<{ messageId: string; event: string }>;
      processor.onFailed(job);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });
});
