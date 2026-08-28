import { Module } from '@nestjs/common';
import { MaildirWatcherService } from './maildir-watcher.service.js';
import { BounceProcessorService } from './bounce-processor.service.js';

@Module({
  providers: [MaildirWatcherService, BounceProcessorService],
})
export class BouncesModule {}
