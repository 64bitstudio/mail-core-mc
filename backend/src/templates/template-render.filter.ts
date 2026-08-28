import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { MissingTemplateVariableError } from './missing-template-variable.error.js';
import { UnsafeTemplateVariableError } from './unsafe-template-variable.error.js';

// Traduce los errores de dominio del render (sin saber nada de HTTP) a un
// 400 con mensaje claro — así TemplatesService.render() los puede lanzar
// tal cual y ser reutilizado luego por el worker de envío (ticket 005)
// sin que ese caller también tenga que conocer este mapeo a HTTP.
@Catch(MissingTemplateVariableError, UnsafeTemplateVariableError)
export class TemplateRenderFilter implements ExceptionFilter {
  private readonly logger = new Logger(TemplateRenderFilter.name);

  catch(exception: MissingTemplateVariableError | UnsafeTemplateVariableError, host: ArgumentsHost) {
    this.logger.warn(exception.message);
    const response = host.switchToHttp().getResponse<Response>();
    response.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: exception.message,
      ...(exception instanceof MissingTemplateVariableError
        ? { missingVariables: exception.missingVariables }
        : {}),
    });
  }
}
