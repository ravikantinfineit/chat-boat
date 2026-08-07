import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsDelegate } from './common/cors';
import { DomainExceptionFilter } from './common/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // One place where domain errors become HTTP responses.
  app.useGlobalFilters(new DomainExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Admin is cookie-authenticated and origin-restricted; the widget is
  // cross-origin by design but never sends credentials. See common/cors.ts.
  app.enableCors(corsDelegate(config.getOrThrow<string[]>('adminOrigins')));

  // Without this, every request behind a proxy shares one IP and the per-IP
  // login limiter becomes either useless or a site-wide lockout.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Diamond chatbot API listening on http://localhost:${port}`);
}

void bootstrap();
