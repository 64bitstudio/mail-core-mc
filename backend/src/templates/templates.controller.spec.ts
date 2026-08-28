import { describe, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

describe('TemplatesController', () => {
  const templatesMock = {
    create: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    render: vi.fn(),
  };

  const setup = async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [{ provide: TemplatesService, useValue: templatesMock }],
    }).compile();
    return module.get(TemplatesController);
  };

  it('create delega en TemplatesService.create', async () => {
    const controller = await setup();
    const dto = { name: 'n', subject: 's', htmlBody: 'h' };
    templatesMock.create.mockResolvedValue({ id: 't1' });

    await controller.create(dto);

    expect(templatesMock.create).toHaveBeenCalledWith(dto);
  });

  it('findOne delega en TemplatesService.findOne', async () => {
    const controller = await setup();
    templatesMock.findOne.mockResolvedValue({ id: 't1' });

    await controller.findOne('t1');

    expect(templatesMock.findOne).toHaveBeenCalledWith('t1');
  });

  it('update delega en TemplatesService.update', async () => {
    const controller = await setup();
    const dto = { subject: 'nuevo' };
    templatesMock.update.mockResolvedValue({ id: 't1', version: 2 });

    await controller.update('t1', dto);

    expect(templatesMock.update).toHaveBeenCalledWith('t1', dto);
  });

  it('render delega en TemplatesService.render con las variables del body', async () => {
    const controller = await setup();
    templatesMock.render.mockResolvedValue({ subject: 'S', html: 'H' });

    const result = await controller.render('t1', { variables: { nombre: 'Marco' } });

    expect(templatesMock.render).toHaveBeenCalledWith('t1', { nombre: 'Marco' });
    expect(result).toEqual({ subject: 'S', html: 'H' });
  });
});
