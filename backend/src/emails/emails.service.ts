import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TemplatesService } from '../templates/templates.service.js';
import { TransactionalQueueService } from './transactional-queue.service.js';
import { CreateEmailDto } from './dto/create-email.dto.js';
import type { Tenant } from '../generated/prisma/client.js';

export interface SendEmailResult {
  messageId: string;
  status: string;
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly queue: TransactionalQueueService,
  ) {}

  /**
   * Punto de entrada de HU-1/HU-6: valida plantilla+variables, revisa
   * supresión, y solo si nada de eso bloquea, encola el envío real
   * (ticket 004) — el worker recibe el mensaje ya renderizado, nunca
   * vuelve a tocar Handlebars.
   */
  async send(dto: CreateEmailDto): Promise<SendEmailResult> {
    const tenant = await this.resolveTenant(dto.tenantId);

    const suppressed = await this.prisma.suppressionEntry.findFirst({
      where: { email: dto.to, OR: [{ tenantId: null }, { tenantId: tenant.id }] },
    });
    if (suppressed) {
      const message = await this.prisma.message.create({
        data: {
          tenantId: tenant.id,
          templateId: dto.templateId,
          recipientEmail: dto.to,
          status: 'suppressed',
        },
      });
      this.logger.warn(`Envío a ${dto.to} bloqueado por supresión (${suppressed.reason})`);
      return { messageId: message.id, status: message.status };
    }

    const rendered = await this.renderOrBadRequest(dto.templateId, dto.variables);

    const message = await this.prisma.message.create({
      data: {
        tenantId: tenant.id,
        templateId: dto.templateId,
        recipientEmail: dto.to,
        renderedSubject: rendered.subject,
        renderedHtml: rendered.html,
        status: 'queued',
      },
    });
    await this.queue.enqueue(message.id);

    return { messageId: message.id, status: message.status };
  }

  async findOne(id: string) {
    const message = await this.prisma.message.findUnique({ where: { id } });
    if (!message) {
      throw new NotFoundException(`Mensaje ${id} no encontrado`);
    }
    return message;
  }

  /**
   * `templates.render` lanza NotFoundException para un template_id que
   * no existe — a nivel de esta API eso es un 400 (petición inválida),
   * no un 404 (no hay "recurso" que buscar, el llamante mandó un dato
   * malo). MissingTemplateVariableError/UnsafeTemplateVariableError se
   * dejan pasar tal cual — el mismo TemplateRenderFilter del ticket 003
   * ya las traduce a 400 en el controller.
   */
  private async renderOrBadRequest(templateId: string, variables: Record<string, unknown>) {
    try {
      return await this.templates.render(templateId, variables);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new BadRequestException(`template_id inválido: ${templateId}`);
      }
      throw err;
    }
  }

  private async resolveTenant(externalId: string = '__default__'): Promise<Tenant> {
    return this.prisma.tenant.upsert({
      where: { externalId },
      update: {},
      create: { externalId, name: externalId },
    });
  }
}
