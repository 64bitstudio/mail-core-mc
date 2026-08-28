import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readFile, rm } from 'node:fs/promises';
import chokidar, { type FSWatcher } from 'chokidar';
import { parseDsnOrComplaint } from './dsn-parser.util.js';
import { BounceProcessorService } from './bounce-processor.service.js';

// Vigila la carpeta new/ del Maildir de bounces@ (ticket 001/006 —
// buzón virtual dedicado, VERP hace que cualquier bounce/complaint
// llegue aquí sin importar de qué tenant vino el envío original). Cada
// archivo nuevo = un correo entregado por Postfix/Dovecot; se procesa y
// se borra (no es un buzón para revisar por IMAP, es solo la bandeja de
// entrada de este watcher).
@Injectable()
export class MaildirWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaildirWatcherService.name);
  private watcher: FSWatcher | undefined;

  constructor(private readonly processor: BounceProcessorService) {}

  onModuleInit() {
    const dir = process.env.BOUNCES_MAILDIR_PATH;
    if (!dir) {
      // Sin VM/infra de bounces configurada (ej. corriendo tests o un
      // entorno que no necesita procesar bounces todavía) — no hay
      // nada que vigilar, pero tampoco es un error fatal de arranque.
      this.logger.warn('BOUNCES_MAILDIR_PATH no configurado — el watcher de bounces no arrancó');
      return;
    }
    this.watcher = chokidar.watch(dir, { ignoreInitial: false, awaitWriteFinish: true });
    this.watcher.on('add', (filePath) => this.handleNewFile(filePath));
    this.logger.log(`Vigilando bounces en ${dir}`);
  }

  async onModuleDestroy() {
    await this.watcher?.close();
  }

  private async handleNewFile(filePath: string) {
    try {
      const raw = await readFile(filePath);
      const parsed = await parseDsnOrComplaint(raw);
      if (!parsed) {
        this.logger.warn(`Correo en bounces@ sin DSN/ARF reconocible, se ignora: ${filePath}`);
      } else {
        await this.processor.process(parsed);
      }
      await rm(filePath); // procesado — no es un buzón para revisar por IMAP
    } catch (err) {
      // Deliberadamente NO se borra el archivo si algo falla — queda en
      // new/ para inspección manual / reintento, en vez de perder el
      // bounce silenciosamente.
      this.logger.error(`Fallo procesando ${filePath}: ${(err as Error).message}`, (err as Error).stack);
    }
  }
}
