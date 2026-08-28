// El subject de un correo es un header SMTP de una sola línea (RFC 5322)
// — un salto de línea crudo ahí no es "texto raro", es una técnica real
// de inyección de headers (ej. meter un "Bcc:" falso vía una variable
// maliciosa). noEscape:true en el subject (necesario porque HTML-escapar
// un header no tiene sentido) hace que esta validación explícita sea la
// única defensa real, así que se lanza en vez de sanear en silencio —
// quien llama debe saber que una variable traía algo inesperado.
export class UnsafeTemplateVariableError extends Error {
  constructor() {
    super('El subject renderizado contiene un salto de línea — variable no segura para un header SMTP');
    this.name = 'UnsafeTemplateVariableError';
  }
}
