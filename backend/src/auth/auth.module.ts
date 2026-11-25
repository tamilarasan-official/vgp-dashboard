import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AuthModule {}
