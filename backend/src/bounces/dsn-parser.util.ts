import { simpleParser } from 'mailparser';
import { parseVerpAddress } from '../emails/verp.util.js';

export interface ParsedDsn {
  type: 'dsn';
  messageId: string;
  isPermanent: boolean; // true = hard bounce (5xx, Action: failed) — false = soft (4xx, Action: delayed)
  statusCode: string | null;
  diagnosticCode: string | null;
}

export interface ParsedComplaint {
  type: 'complaint';
  messageId: string;
}

export type ParsedBounceEmail = ParsedDsn | ParsedComplaint | null;

/**
 * Parsea un correo crudo (buffer del Maildir) que llegó a
 * bounces+{messageId}@dominio y determina si es un DSN (bounce) o un
 * reporte ARF (complaint), y qué acción implica.
 *
 * Nunca lanza — un correo que no matchea ninguno de los dos formatos
 * (o sin el message_id de VERP) devuelve null, y el llamante decide qué
 * hacer (loguear y descartar, típicamente).
 */
export async function parseDsnOrComplaint(raw: Buffer): Promise<ParsedBounceEmail> {
  const parsed = await simpleParser(raw);

  // mailparser trata "delivered-to" como header de tipo dirección (igual
  // que To/From/Cc) — no llega como string plano, sino como
  // AddressObject con .text ya normalizado a "usuario@dominio".
  const deliveredTo = parsed.headers.get('delivered-to');
  const deliveredToText =
    typeof deliveredTo === 'string' ? deliveredTo : (deliveredTo as { text?: string } | undefined)?.text;
  const messageId = deliveredToText ? parseVerpAddress(deliveredToText) : null;
  if (!messageId) {
    return null; // no es una respuesta a un envío nuestro (o VERP no matcheó) — nada que procesar
  }

  // ARF (complaint): mailparser SÍ expone message/feedback-report como
  // .attachments (verificado — no es una suposición).
  const feedbackReport = parsed.attachments.find((a) => a.contentType === 'message/feedback-report');
  if (feedbackReport) {
    return { type: 'complaint', messageId };
  }

  // DSN: a diferencia del feedback-report, mailparser NO expone
  // message/delivery-status como .attachments — lo concatena dentro de
  // .text junto con la parte humana legible del reporte (verificado
  // contra un DSN real de este mismo Postfix, no un supuesto de la
  // documentación). El content-type del mensaje SÍ es confiable para
  // clasificar "esto es un DSN".
  const contentType = parsed.headers.get('content-type') as
    | { value?: string; params?: Record<string, string> }
    | undefined;
  const isDsn = contentType?.value === 'multipart/report' && contentType.params?.['report-type'] === 'delivery-status';
  if (isDsn && parsed.text) {
    const action = matchField(parsed.text, 'Action');
    const status = matchField(parsed.text, 'Status');
    const diagnostic = matchField(parsed.text, 'Diagnostic-Code');
    return {
      type: 'dsn',
      messageId,
      // RFC 3464: "failed" = permanente (5xx); "delayed" = transitorio
      // (4xx, puede seguir reintentando el otro lado); cualquier otro
      // valor (relayed/expanded/delivered) no es un bounce real, se
      // trata como no-permanente para no suprimir de más.
      isPermanent: action?.toLowerCase() === 'failed',
      statusCode: status,
      diagnosticCode: diagnostic,
    };
  }

  return null;
}

function matchField(text: string, field: string): string | null {
  const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : null;
}
