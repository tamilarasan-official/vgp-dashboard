import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '25mb' }); // agent batches (Tally vouchers) can be large
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3100' });
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
