import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // whitelist: descarta campos no declarados en el DTO en vez de
  // pasarlos silenciosamente a Prisma. forbidNonWhitelisted: rechaza la
  // petición si trae campos extra, en vez de ignorarlos sin decir nada.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
