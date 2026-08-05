import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // Unknown query params are dropped rather than rejected — a test ERP
      // should not 400 because the caller sent one extra filter.
      whitelist: true,
    }),
  );

  const port = Number(config.get('ERP_MOCK_PORT') ?? 4010);
  await app.listen(port);

  const log = new Logger('Bootstrap');
  log.log(`Mock ERP listening on http://localhost:${port}`);
  log.log(`Authorization: Bearer ${config.get('ERP_MOCK_API_KEY') ?? 'test-key'}`);
}

void bootstrap();
