import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailsService } from './emails.service.js';
import { MissingTemplateVariableError } from '../templates/missing-template-variable.error.js';
import { TenantsService } from '../tenants/tenants.service.js';

describe('EmailsService', () => {
  let service: EmailsService;
  const prismaMock = {
    tenant: { upsert: vi.fn() },
    suppressionEntry: { findFirst: vi.fn() },
    message: { create: vi.fn(), findUnique: vi.fn() },
  };
  const templatesMock = { render: vi.fn() };
  const queueMock = { enqueue: vi.fn() };

  const tenant = { id: 'tenant-1', externalId: '__default__', name: '__default__' };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenant.upsert.mockResolvedValue(tenant);
    const tenants = new TenantsService(prismaMock as never);
    service = new EmailsService(prismaMock as never, templatesMock as never, queueMock as never, tenants);
  });

  describe('send', () => {
    it('renderiza, crea el Message y encola cuando todo es válido (AC1)', async () => {
      prismaMock.suppressionEntry.findFirst.mockResolvedValue(null);
      templatesMock.render.mockResolvedValue({ subject: 'Hola', html: '<p>Hola</p>' });
      prismaMock.message.create.mockResolvedValue({ id: 'msg-1', status: 'queued' });

      const result = await service.send({ templateId: 't1', to: 'a@test.com', variables: { nombre: 'A' } });

      expect(result).toEqual({ messageId: 'msg-1', status: 'queued' });
      expect(prismaMock.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          renderedSubject: 'Hola',
          renderedHtml: '<p>Hola</p>',
          status: 'queued',
          recipientEmail: 'a@test.com',
        }),
      });
      expect(queueMock.enqueue).toHaveBeenCalledWith('msg-1');
    });

    it('no encola y marca suppressed si el destinatario está en la lista de supresión (AC4)', async () => {
      prismaMock.suppressionEntry.findFirst.mockResolvedValue({ reason: 'bounce' });
      prismaMock.message.create.mockResolvedValue({ id: 'msg-2', status: 'suppressed' });

      const result = await service.send({ templateId: 't1', to: 'suprimido@test.com', variables: {} });

      expect(result).toEqual({ messageId: 'msg-2', status: 'suppressed' });
      expect(templatesMock.render).not.toHaveBeenCalled();
      expect(queueMock.enqueue).not.toHaveBeenCalled();
    });

    it('busca supresión global (tenantId null) y de este tenant, no de otros', async () => {
      prismaMock.suppressionEntry.findFirst.mockResolvedValue(null);
      templatesMock.render.mockResolvedValue({ subject: 'S', html: 'H' });
      prismaMock.message.create.mockResolvedValue({ id: 'msg-3', status: 'queued' });

      await service.send({ templateId: 't1', to: 'a@test.com', variables: {} });

      expect(prismaMock.suppressionEntry.findFirst).toHaveBeenCalledWith({
        where: { email: 'a@test.com', OR: [{ tenantId: null }, { tenantId: 'tenant-1' }] },
      });
    });

    it('convierte un template_id inexistente en 400, no en 404 (AC5)', async () => {
      prismaMock.suppressionEntry.findFirst.mockResolvedValue(null);
      templatesMock.render.mockRejectedValue(new NotFoundException('no existe'));

      await expect(
        service.send({ templateId: 'inexistente', to: 'a@test.com', variables: {} }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });

    it('deja pasar tal cual un error de variable faltante (lo traduce el filter del controller)', async () => {
      prismaMock.suppressionEntry.findFirst.mockResolvedValue(null);
      templatesMock.render.mockRejectedValue(new MissingTemplateVariableError(['nombre']));

      await expect(
        service.send({ templateId: 't1', to: 'a@test.com', variables: {} }),
      ).rejects.toBeInstanceOf(MissingTemplateVariableError);
    });

    it('crea (o reusa) el tenant por defecto cuando no se manda tenantId', async () => {
      prismaMock.suppressionEntry.findFirst.mockResolvedValue(null);
      templatesMock.render.mockResolvedValue({ subject: 'S', html: 'H' });
      prismaMock.message.create.mockResolvedValue({ id: 'msg-4', status: 'queued' });

      await service.send({ templateId: 't1', to: 'a@test.com', variables: {} });

      expect(prismaMock.tenant.upsert).toHaveBeenCalledWith({
        where: { externalId: '__default__' },
        update: {},
        create: { externalId: '__default__', name: '__default__' },
      });
    });

    it('usa el tenantId externo dado en vez del default', async () => {
      prismaMock.suppressionEntry.findFirst.mockResolvedValue(null);
      templatesMock.render.mockResolvedValue({ subject: 'S', html: 'H' });
      prismaMock.message.create.mockResolvedValue({ id: 'msg-5', status: 'queued' });

      await service.send({ templateId: 't1', to: 'a@test.com', variables: {}, tenantId: 'acme' });

      expect(prismaMock.tenant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { externalId: 'acme' } }),
      );
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si el mensaje no existe', async () => {
      prismaMock.message.findUnique.mockResolvedValue(null);
      await expect(service.findOne('inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
