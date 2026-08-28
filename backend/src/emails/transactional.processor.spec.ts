import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { TransactionalProcessor } from './transactional.processor.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('TransactionalProcessor', () => {
  let processor: TransactionalProcessor;
  const prismaMock = {
    message: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaService;
  const transportMock = { sendMail: vi.fn() };
  const webhooksMock = { enqueue: vi.fn() };

  const baseMessage = {
    id: 'msg-1',
    recipientEmail: 'destino@test.com',
    renderedSubject: 'Hola',
    renderedHtml: '<p>Hola</p>',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new TransactionalProcessor(prismaMock, transportMock as never, webhooksMock as never);
    (prismaMock.message.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(baseMessage);
  });

  function makeJob(attemptsMade: number, attempts = 5): Job<{ messageId: string }> {
    return { data: { messageId: 'msg-1' }, attemptsMade, opts: { attempts } } as unknown as Job<{
      messageId: string;
    }>;
  }

  it('marca el mensaje como sent cuando Postfix acepta el envío (AC1)', async () => {
    transportMock.sendMail.mockResolvedValue({ messageId: '<abc@mail.64bitstudio.com>' });

    await processor.process(makeJob(0));

    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: expect.objectContaining({ status: 'sent', providerMessageId: '<abc@mail.64bitstudio.com>' }),
    });
  });

  it('relanza el error y no marca failed todavía ante un rechazo 4xx transitorio (AC2)', async () => {
    transportMock.sendMail.mockRejectedValue({ responseCode: 450, message: 'greylisted' });

    await expect(processor.process(makeJob(0))).rejects.toMatchObject({ responseCode: 450 });

    // se registra el intento, pero NO se marca failed — todavía puede reintentar
    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: expect.objectContaining({ attemptsMade: 1, lastError: 'greylisted' }),
    });
    const call = (prismaMock.message.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.status).toBeUndefined();
  });

  it('marca failed sin reintentar ante un rechazo 5xx permanente (AC3)', async () => {
    transportMock.sendMail.mockRejectedValue({ responseCode: 550, message: 'mailbox inexistente' });

    await expect(processor.process(makeJob(0))).resolves.toBeNull(); // no relanza

    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: expect.objectContaining({ status: 'failed', lastError: 'mailbox inexistente' }),
    });
  });

  describe('onFailed', () => {
    it('no toca el mensaje si todavía quedan reintentos', async () => {
      await processor.onFailed(makeJob(2, 5)); // intento 2 de 5, no es el último

      expect(prismaMock.message.update).not.toHaveBeenCalled();
    });

    it('marca failed cuando se agotan los intentos (AC3)', async () => {
      const job = { ...makeJob(5, 5), failedReason: 'greylisted' } as Job<{ messageId: string }>;

      await processor.onFailed(job);

      expect(prismaMock.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { status: 'failed', lastError: 'greylisted' },
      });
    });
  });
});
