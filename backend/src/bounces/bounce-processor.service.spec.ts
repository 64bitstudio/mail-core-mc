import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BounceProcessorService } from './bounce-processor.service.js';

describe('BounceProcessorService', () => {
  let service: BounceProcessorService;
  const prismaMock = {
    message: { findUnique: vi.fn(), update: vi.fn() },
    suppressionEntry: { findFirst: vi.fn(), create: vi.fn() },
  };
  const webhooksMock = { enqueue: vi.fn() };

  const message = { id: 'msg-1', recipientEmail: 'a@test.com', tenantId: 'tenant-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.message.findUnique.mockResolvedValue(message);
    prismaMock.suppressionEntry.findFirst.mockResolvedValue(null);
    service = new BounceProcessorService(prismaMock as never, webhooksMock as never);
  });

  it('un hard bounce suprime globalmente (tenantId null), marca el Message bounced y notifica el webhook (AC1)', async () => {
    await service.process({
      type: 'dsn',
      messageId: 'msg-1',
      isPermanent: true,
      statusCode: '5.1.1',
      diagnosticCode: 'User unknown',
    });

    expect(prismaMock.suppressionEntry.create).toHaveBeenCalledWith({
      data: { email: 'a@test.com', reason: 'bounce', tenantId: null },
    });
    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'bounced', lastError: 'User unknown' },
    });
    expect(webhooksMock.enqueue).toHaveBeenCalledWith('msg-1', 'bounced');
  });

  it('un soft bounce NO suprime, NO marca el Message, NI notifica webhook (AC2)', async () => {
    await service.process({ type: 'dsn', messageId: 'msg-1', isPermanent: false, statusCode: '4.4.7', diagnosticCode: null });

    expect(prismaMock.suppressionEntry.create).not.toHaveBeenCalled();
    expect(prismaMock.message.update).not.toHaveBeenCalled();
    expect(webhooksMock.enqueue).not.toHaveBeenCalled();
  });

  it('un complaint suprime globalmente, marca el Message complained y notifica el webhook (AC3)', async () => {
    await service.process({ type: 'complaint', messageId: 'msg-1' });

    expect(prismaMock.suppressionEntry.create).toHaveBeenCalledWith({
      data: { email: 'a@test.com', reason: 'complaint', tenantId: null },
    });
    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'complained' },
    });
    expect(webhooksMock.enqueue).toHaveBeenCalledWith('msg-1', 'complained');
  });

  it('no duplica la supresión si el email ya está suprimido', async () => {
    prismaMock.suppressionEntry.findFirst.mockResolvedValue({ id: 'existing' });

    await service.process({ type: 'dsn', messageId: 'msg-1', isPermanent: true, statusCode: '5.1.1', diagnosticCode: null });

    expect(prismaMock.suppressionEntry.create).not.toHaveBeenCalled();
  });

  it('ignora silenciosamente un message_id que no existe (log, sin crashear)', async () => {
    prismaMock.message.findUnique.mockResolvedValue(null);

    await expect(
      service.process({ type: 'dsn', messageId: 'inexistente', isPermanent: true, statusCode: '5.1.1', diagnosticCode: null }),
    ).resolves.toBeUndefined();
    expect(prismaMock.suppressionEntry.create).not.toHaveBeenCalled();
    expect(webhooksMock.enqueue).not.toHaveBeenCalled();
  });
});
