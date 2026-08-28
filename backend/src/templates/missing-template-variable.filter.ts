import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { MissingTemplateVariableError } from './missing-template-variable.error.js';

// Traduce el error de dominio (sin saber nada de HTTP) a un 400 con
// mensaje claro — así TemplatesService.render() lo puede lanzar tal
// cual y ser reutilizado luego por el worker de envío (ticket 005) sin
// que ese caller también tenga que conocer este mapeo a HTTP.
@Catch(MissingTemplateVariableError)
export class MissingTemplateVariableFilter implements ExceptionFilter {
  private readonly logger = new Logger(MissingTemplateVariableFilter.name);

  catch(exception: MissingTemplateVariableError, host: ArgumentsHost) {
    this.logger.warn(exception.message);
    const response = host.switchToHttp().getResponse<Response>();
    response.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: exception.message,
      missingVariables: exception.missingVariables,
    });
  }
}
