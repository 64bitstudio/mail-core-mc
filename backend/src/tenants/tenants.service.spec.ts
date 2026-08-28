import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantsService, DEFAULT_TENANT_EXTERNAL_ID } from './tenants.service.js';

describe('TenantsService', () => {
  let service: TenantsService;
  const prismaMock = { tenant: { upsert: vi.fn() } };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantsService(prismaMock as never);
  });

  it('usa el tenant compartido por defecto cuando no se da externalId', async () => {
    prismaMock.tenant.upsert.mockResolvedValue({ id: 'tenant-default' });

    await service.resolveTenant();

    expect(prismaMock.tenant.upsert).toHaveBeenCalledWith({
      where: { externalId: DEFAULT_TENANT_EXTERNAL_ID },
      update: {},
      create: { externalId: DEFAULT_TENANT_EXTERNAL_ID, name: DEFAULT_TENANT_EXTERNAL_ID },
    });
  });

  it('usa el externalId dado', async () => {
    prismaMock.tenant.upsert.mockResolvedValue({ id: 'tenant-acme' });

    await service.resolveTenant('acme');

    expect(prismaMock.tenant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalId: 'acme' } }),
    );
  });
});
