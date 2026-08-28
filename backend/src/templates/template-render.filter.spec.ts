import { describe, it, expect, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { TemplateRenderFilter } from './template-render.filter.js';
import { MissingTemplateVariableError } from './missing-template-variable.error.js';
import { UnsafeTemplateVariableError } from './unsafe-template-variable.error.js';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('TemplateRenderFilter', () => {
  it('responde 400 con missingVariables cuando falta una variable', () => {
    const filter = new TemplateRenderFilter();
    const { host, status, json } = mockHost();

    filter.catch(new MissingTemplateVariableError(['link']), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, missingVariables: ['link'] }),
    );
  });

  it('responde 400 sin missingVariables cuando el subject trae un salto de línea inseguro', () => {
    const filter = new TemplateRenderFilter();
    const { host, status, json } = mockHost();

    filter.catch(new UnsafeTemplateVariableError(), host);

    expect(status).toHaveBeenCalledWith(400);
    const payload = json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('missingVariables');
    expect(payload.statusCode).toBe(400);
  });
});
