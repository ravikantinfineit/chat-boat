import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // The widget is embedded on the dealer's own site, so it is cross-origin by
  // design. Narrow this to the dealer's domains before going live.
  app.enableCors({ origin: true, credentials: true });

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Diamond chatbot API listening on http://localhost:${port}`);
}

void bootstrap();
