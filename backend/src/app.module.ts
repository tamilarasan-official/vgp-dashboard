import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { FunsquareModule } from './connectors/funsquare/funsquare.module';
import { TallyModule } from './connectors/tally/tally.module';
import { ZohoModule } from './connectors/zoho/zoho.module';
import { GreythrModule } from './connectors/greythr/greythr.module';
import { AuthModule } from './auth/auth.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot(), PrismaModule, FunsquareModule, TallyModule, ZohoModule, GreythrModule, AuthModule, UploadsModule],
  controllers: [HealthController],
})
export class AppModule {}
