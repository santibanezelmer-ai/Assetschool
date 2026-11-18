import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as path from 'path';
import { json, urlencoded } from 'express';
import { loadLocalEnvFile, requireJwtSecret } from './config/required-env';

async function bootstrap() {
  const logger = new Logger('AssetSchoolCore');

  // R0 / S7: secrets come from the environment or a local env file (never from code).
  const envFile = loadLocalEnvFile([
    process.env.ASSETSCHOOL_ENV_FILE || '',
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '..', '..', '.env.local'),
  ]);
  if (envFile) {
    logger.log(`Variables de entorno cargadas desde ${envFile}`);
  }
  try {
    requireJwtSecret();
  } catch (err: any) {
    logger.error(err.message);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // Security: Configurable CORS policy for local LAN
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, desktop agents)
      if (!origin) return callback(null, true);
      // In development / local LAN, accept local networks and configured origins
      const isLocalLan =
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        );
      if (allowedOrigins.includes(origin) || isLocalLan) {
        callback(null, true);
      } else {
        logger.warn(`Petición bloqueada por CORS: origen '${origin}' no autorizado`);
        callback(new Error('Bloqueado por política CORS institucional'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Graceful shutdown handling for independent service lifecycle
  const handleShutdown = async (signal: string) => {
    logger.log(`Señal de detención recibida (${signal}). Cerrando AssetSchool Server de forma segura...`);
    try {
      await app.close();
      logger.log('AssetSchool Server cerrado con éxito.');
      process.exit(0);
    } catch (err: any) {
      logger.error(`Error durante el cierre del servidor: ${err.message}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  logger.log(`================================================================`);
  logger.log(`  AssetSchool Local Server — Core Engine (Phase 01.1 Audited)`);
  logger.log(`  REST API listening on: http://localhost:${port}/api/v1`);
  logger.log(`  Agent WebSocket Gateway active on port: ${port}`);
  logger.log(`  Local LAN Discovery: UDP 48500 (WebSocket compartido en el puerto ${port})`);
  logger.log(`================================================================`);
}

bootstrap();
