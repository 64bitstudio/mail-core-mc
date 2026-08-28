import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDsnOrComplaint } from './dsn-parser.util.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function fixture(name: string): Promise<Buffer> {
  return readFile(path.join(fixturesDir, name));
}

describe('parseDsnOrComplaint', () => {
  // hard-bounce-real.eml es un DSN real, capturado en vivo de esta
  // misma instancia de Postfix (ticket 006) — no un mock inventado.
  it('reconoce un hard bounce real como permanente (AC1)', async () => {
    const raw = await fixture('hard-bounce-real.eml');

    const result = await parseDsnOrComplaint(raw);

    expect(result).toEqual(
      expect.objectContaining({
        type: 'dsn',
        messageId: 'prueba-dsn-real',
        isPermanent: true,
        statusCode: '5.1.1',
      }),
    );
  });

  it('reconoce un soft bounce (Action: delayed) como transitorio, no permanente (AC2)', async () => {
    const raw = await fixture('soft-bounce.eml');

    const result = await parseDsnOrComplaint(raw);

    expect(result).toEqual(
      expect.objectContaining({ type: 'dsn', messageId: 'msg-soft-1', isPermanent: false }),
    );
  });

  it('reconoce un reporte ARF como complaint (AC3)', async () => {
    const raw = await fixture('complaint-arf.eml');

    const result = await parseDsnOrComplaint(raw);

    expect(result).toEqual({ type: 'complaint', messageId: 'msg-complaint-1' });
  });

  it('devuelve null si el correo no tiene un Delivered-To VERP reconocible', async () => {
    const raw = Buffer.from(
      'Delivered-To: cualquier-otra-cosa@mail.64bitstudio.com\r\nSubject: hola\r\n\r\ncuerpo\r\n',
    );

    expect(await parseDsnOrComplaint(raw)).toBeNull();
  });

  it('devuelve null si tiene VERP pero no es ni DSN ni ARF (spam al buzón, etc.)', async () => {
    const raw = Buffer.from(
      'Delivered-To: bounces+algo@mail.64bitstudio.com\r\nSubject: hola\r\n\r\ncuerpo normal\r\n',
    );

    expect(await parseDsnOrComplaint(raw)).toBeNull();
  });
});
