import { describe, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ScopesGuard } from '../auth/scopes.guard.js';

describe('WebhooksController', () => {
  it('register delega en WebhooksService.register con el DTO completo', async () => {
    const webhooksMock = { register: vi.fn().mockResolvedValue({ url: 'https://x.test', secret: 'sh' }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhooksService, useValue: webhooksMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ScopesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get(WebhooksController);

    const dto = { url: 'https://callback.test/hook' };
    const result = await controller.register(dto);

    expect(webhooksMock.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ url: 'https://x.test', secret: 'sh' });
  });
});
