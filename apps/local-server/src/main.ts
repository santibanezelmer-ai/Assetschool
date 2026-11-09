import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('AssetSchoolCore');
  const app = await NestFactory.create(AppModule);

  // Enable CORS for local teacher and admin web applications
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`================================================================`);
  logger.log(`  AssetSchool Local Server — Core Engine (Phase 01)`);
  logger.log(`  REST API listening on: http://localhost:${port}/api/v1`);
  logger.log(`  Agent WebSocket Gateway active on port: ${port}`);
  logger.log(`  Local LAN Discovery: Active`);
  logger.log(`================================================================`);
}

bootstrap();
