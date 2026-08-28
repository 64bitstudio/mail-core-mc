import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhooksService } from './webhooks.service.js';

describe('WebhooksService', () => {
  let service: WebhooksService;
  const prismaMock = { webhookSubscription: { upsert: vi.fn() } };
  const tenantsMock = { resolveTenant: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    tenantsMock.resolveTenant.mockResolvedValue({ id: 'tenant-1' });
    service = new WebhooksService(prismaMock as never, tenantsMock as never);
  });

  it('registra el webhook (upsert por tenant) y devuelve un secret generado', async () => {
    const result = await service.register({ url: 'https://callback.test/hook' });

    expect(tenantsMock.resolveTenant).toHaveBeenCalledWith(undefined);
    expect(prismaMock.webhookSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        create: expect.objectContaining({ tenantId: 'tenant-1', url: 'https://callback.test/hook' }),
      }),
    );
    expect(result.url).toBe('https://callback.test/hook');
    expect(result.secret).toHaveLength(64);
  });

  it('registrar de nuevo sobre el mismo tenant rota el secret (no reusa el anterior)', async () => {
    const first = await service.register({ url: 'https://callback.test/hook' });
    const second = await service.register({ url: 'https://callback.test/hook-v2' });

    expect(second.secret).not.toBe(first.secret);
  });

  it('usa el tenantId dado en vez del default', async () => {
    await service.register({ url: 'https://callback.test/hook', tenantId: 'acme' });

    expect(tenantsMock.resolveTenant).toHaveBeenCalledWith('acme');
  });
});
