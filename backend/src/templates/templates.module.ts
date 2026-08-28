import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    AuthModule,
    // Necesario aquí también, no solo en AuthModule (ticket 010, mismo
    // gotcha documentado en EmailsModule/WebhooksModule): @UseGuards(JwtAuthGuard)
    // en TemplatesController resuelve JwtAuthGuard con el injector de
    // TemplatesModule, que necesita su propia visibilidad de AuthModuleOptions.
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService], // el ticket 005 (envío) lo necesita para render()
})
export class TemplatesModule {}
