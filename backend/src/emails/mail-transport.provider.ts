import type { Provider } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

// Token inyectable en vez de importar nodemailer directo en el processor
// — así los tests unitarios mockean el transporte sin necesitar un
// Postfix real corriendo. Apunta a la instancia transaccional de dev
// (ticket 001); en la VM (ticket 009) solo cambian las env vars.
export const mailTransportProvider: Provider = {
  provide: MAIL_TRANSPORT,
  useFactory: () =>
    createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false,
      // La instancia de dev (ticket 001) no anuncia STARTTLS todavía
      // (SSL_TYPE vacío a propósito, ver docs/ARQUITECTURA.md) —
      // ignoreTLS evita que nodemailer intente negociarlo y falle.
      ignoreTLS: process.env.SMTP_IGNORE_TLS !== 'false',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    }),
};
