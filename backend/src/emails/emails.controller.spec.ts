import { describe, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailsController } from './emails.controller.js';
import { EmailsService } from './emails.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ScopesGuard } from '../auth/scopes.guard.js';

describe('EmailsController', () => {
  const emailsMock = { send: vi.fn(), findOne: vi.fn() };

  const setup = async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailsController],
      providers: [{ provide: EmailsService, useValue: emailsMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ScopesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    return module.get(EmailsController);
  };

  it('send delega en EmailsService.send con el DTO completo', async () => {
    const controller = await setup();
    const dto = { templateId: 't1', to: 'a@test.com', variables: { nombre: 'A' } };
    emailsMock.send.mockResolvedValue({ messageId: 'msg-1', status: 'queued' });

    const result = await controller.send(dto);

    expect(emailsMock.send).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ messageId: 'msg-1', status: 'queued' });
  });

  it('findOne delega en EmailsService.findOne', async () => {
    const controller = await setup();
    emailsMock.findOne.mockResolvedValue({ id: 'msg-1', status: 'sent' });

    const result = await controller.findOne('msg-1');

    expect(emailsMock.findOne).toHaveBeenCalledWith('msg-1');
    expect(result).toEqual({ id: 'msg-1', status: 'sent' });
  });
});
