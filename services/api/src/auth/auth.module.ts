import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { BearerGuard } from './bearer.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [RolesGuard, AuthService, OtpService, SessionService, BearerGuard],
  exports: [RolesGuard, AuthService, OtpService, SessionService, BearerGuard],
})
export class AuthModule {}
