// Error de dominio, no atado a HTTP — el controller lo traduce a 400.
// Así el ticket 005 (worker de envío) puede capturarlo por tipo sin
// depender de que TemplatesService conozca nada de HTTP.
export class MissingTemplateVariableError extends Error {
  constructor(public readonly missingVariables: string[]) {
    super(`Faltan variables requeridas por la plantilla: ${missingVariables.join(', ')}`);
    this.name = 'MissingTemplateVariableError';
  }
}
