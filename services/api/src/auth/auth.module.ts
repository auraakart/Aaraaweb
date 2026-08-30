import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [RolesGuard, AuthService],
  exports: [RolesGuard, AuthService],
})
export class AuthModule {}
