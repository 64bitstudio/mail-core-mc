// Mismo criterio que smtp-error.util.ts (ticket 004), aplicado a HTTP:
// 5xx del endpoint del llamante (o timeout/error de red) es su problema
// momentáneo — vale la pena reintentar. 4xx significa que lo que le
// mandamos está mal (payload, URL, lo que sea) — reintentar no lo va a
// arreglar solo.
export function isTransientWebhookError(statusCode?: number): boolean {
  if (typeof statusCode !== 'number') {
    return true; // sin status = timeout/error de red, se asume transitorio
  }
  return statusCode >= 500;
}
