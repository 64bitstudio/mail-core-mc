import { Injectable, NotFoundException } from '@nestjs/common';
import Handlebars from 'handlebars';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTemplateDto } from './dto/create-template.dto.js';
import { UpdateTemplateDto } from './dto/update-template.dto.js';
import { MissingTemplateVariableError } from './missing-template-variable.error.js';
import { UnsafeTemplateVariableError } from './unsafe-template-variable.error.js';

export interface RenderedTemplate {
  subject: string;
  html: string;
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateTemplateDto) {
    return this.prisma.template.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        subject: dto.subject,
        htmlBody: dto.htmlBody,
      },
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const existing = await this.findOne(id);
    return this.prisma.template.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        subject: dto.subject ?? existing.subject,
        htmlBody: dto.htmlBody ?? existing.htmlBody,
        version: { increment: 1 },
      },
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Plantilla ${id} no encontrada`);
    }
    return template;
  }

  /**
   * Renderiza subject + htmlBody sustituyendo variables. Falla rápido
   * (MissingTemplateVariableError) si falta alguna variable requerida —
   * nunca se manda un correo con placeholders sin sustituir.
   *
   * Alcance v1 (ver ticket 003): solo variables planas `{{variable}}`.
   * Variables dentro de bloques `{{#each}}`/`{{#if}}` no se detectan como
   * requeridas (no se camina el cuerpo del bloque) — limitación
   * documentada, no soportada todavía.
   */
  async render(templateId: string, variables: Record<string, unknown>): Promise<RenderedTemplate> {
    const template = await this.findOne(templateId);

    const required = new Set([
      ...this.extractRequiredVariables(template.subject),
      ...this.extractRequiredVariables(template.htmlBody),
    ]);
    const missing = [...required].filter((name) => !(name in variables));
    if (missing.length > 0) {
      throw new MissingTemplateVariableError(missing);
    }

    // noEscape:true es correcto aquí (el subject es texto de header, no
    // HTML — escaparlo produciría "&amp;" literal en el asunto) pero abre
    // la puerta a inyección de headers SMTP si una variable trae un salto
    // de línea crudo; se valida explícitamente abajo en vez de confiar en
    // el escaping HTML que aquí no aplica. NOSONAR: ver validación de
    // renderedSubject más abajo — no es un noEscape sin mitigación.
    const renderedSubject = Handlebars.compile(template.subject, { noEscape: true })(variables); // NOSONAR
    if (/[\r\n]/.test(renderedSubject)) {
      throw new UnsafeTemplateVariableError();
    }

    return {
      subject: renderedSubject,
      html: Handlebars.compile(template.htmlBody)(variables),
    };
  }

  /**
   * Extrae los nombres de variables top-level (`{{variable}}`) referenciadas
   * en una plantilla, vía el AST de Handlebars — no una regex, para no
   * confundir texto/HTML incidental con una referencia real.
   */
  extractRequiredVariables(source: string): string[] {
    const ast = Handlebars.parse(source);
    const names = new Set<string>();

    for (const statement of ast.body) {
      if (statement.type !== 'MustacheStatement') continue;
      const mustache = statement as hbs.AST.MustacheStatement;
      const path = mustache.path as hbs.AST.PathExpression;
      // Ignora @index/@key (variables de contexto de Handlebars) y
      // rutas con params/hash (llamadas a helper, no una variable simple).
      if (path.type !== 'PathExpression' || path.data) continue;
      if (mustache.params.length > 0 || mustache.hash) continue;
      names.add(path.original);
    }

    return [...names];
  }
}
