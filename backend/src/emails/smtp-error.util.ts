// Nodemailer expone el código de respuesta SMTP real en `responseCode`
// cuando el error viene del servidor (no de la red). RFC 5321: 4xx es
// transitorio (reintentar tiene sentido — buzón lleno, greylisting,
// límite de tasa), 5xx es permanente (reintentar es inútil — dirección
// inexistente, dominio no existe). Errores de red (sin responseCode,
// ej. ECONNREFUSED si Postfix está caído un momento) se tratan como
// transitorios — más seguro asumir "puede que se arregle solo" que
// marcar failed por una falla de infraestructura momentánea.
export function isTransientSmtpError(err: unknown): boolean {
  const responseCode = (err as { responseCode?: number })?.responseCode;
  if (typeof responseCode === 'number') {
    return responseCode >= 400 && responseCode < 500;
  }
  return true;
}
