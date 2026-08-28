import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MissingTemplateVariableError } from './missing-template-variable.error.js';
import { UnsafeTemplateVariableError } from './unsafe-template-variable.error.js';

describe('TemplatesService', () => {
  let service: TemplatesService;
  const prismaMock = {
    template: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplatesService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(TemplatesService);
  });

  describe('create', () => {
    it('crea la plantilla con los datos dados', async () => {
      prismaMock.template.create.mockResolvedValue({ id: 't1', version: 1 });
      await service.create({ name: 'bienvenida', subject: 'Hola {{nombre}}', htmlBody: '<p>{{nombre}}</p>' });
      expect(prismaMock.template.create).toHaveBeenCalledWith({
        data: {
          tenantId: undefined,
          name: 'bienvenida',
          subject: 'Hola {{nombre}}',
          htmlBody: '<p>{{nombre}}</p>',
        },
      });
    });
  });

  describe('update', () => {
    it('incrementa la versión en cada actualización', async () => {
      prismaMock.template.findUnique.mockResolvedValue({
        id: 't1',
        name: 'vieja',
        subject: 'S',
        htmlBody: 'H',
        version: 1,
      });
      prismaMock.template.update.mockResolvedValue({ id: 't1', version: 2 });

      await service.update('t1', { subject: 'Nuevo asunto' });

      expect(prismaMock.template.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: {
          name: 'vieja',
          subject: 'Nuevo asunto',
          htmlBody: 'H',
          version: { increment: 1 },
        },
      });
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si la plantilla no existe', async () => {
      prismaMock.template.findUnique.mockResolvedValue(null);
      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('extractRequiredVariables', () => {
    it('extrae variables planas top-level', () => {
      const vars = service.extractRequiredVariables('Hola {{nombre}}, entra a {{link}}');
      expect(vars.sort()).toEqual(['link', 'nombre']);
    });

    it('no duplica una variable repetida', () => {
      const vars = service.extractRequiredVariables('{{nombre}} - {{nombre}}');
      expect(vars).toEqual(['nombre']);
    });
  });

  describe('render', () => {
    it('sustituye correctamente todas las variables cuando están provistas (AC2)', async () => {
      prismaMock.template.findUnique.mockResolvedValue({
        id: 't1',
        subject: 'Hola {{nombre}}',
        htmlBody: '<a href="{{link}}">{{nombre}}</a>',
        version: 1,
      });

      const result = await service.render('t1', { nombre: 'Marco', link: 'https://x.test' });

      expect(result.subject).toBe('Hola Marco');
      expect(result.html).toBe('<a href="https://x.test">Marco</a>');
    });

    it('falla con un error claro si falta una variable requerida, sin renderizar nada (AC3)', async () => {
      prismaMock.template.findUnique.mockResolvedValue({
        id: 't1',
        subject: 'Hola {{nombre}}',
        htmlBody: '<a href="{{link}}">{{nombre}}</a>',
        version: 1,
      });

      const call = service.render('t1', { nombre: 'Marco' }); // falta "link"

      await expect(call).rejects.toBeInstanceOf(MissingTemplateVariableError);
      await expect(call).rejects.toThrow(/link/);
    });

    it('escapa HTML en el body (no en el subject) para evitar inyección vía variables', async () => {
      prismaMock.template.findUnique.mockResolvedValue({
        id: 't1',
        subject: 'Hola {{nombre}}',
        htmlBody: '<p>{{nombre}}</p>',
        version: 1,
      });

      const result = await service.render('t1', { nombre: '<script>alert(1)</script>' });

      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('&lt;script&gt;');
    });

    it('rechaza una variable que inyecta un salto de línea en el subject (inyección de headers SMTP)', async () => {
      prismaMock.template.findUnique.mockResolvedValue({
        id: 't1',
        subject: 'Hola {{nombre}}',
        htmlBody: '<p>{{nombre}}</p>',
        version: 1,
      });

      const call = service.render('t1', { nombre: 'Marco\nBcc: atacante@evil.test' });

      await expect(call).rejects.toBeInstanceOf(UnsafeTemplateVariableError);
    });
  });
});
