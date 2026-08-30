import { Body, Controller, Post } from '@nestjs/common';
import { IsPhoneNumber, IsString, Length } from 'class-validator';
import { AuthService } from './auth.service';

class RequestOtpDto {
  @IsPhoneNumber(null)
  phone!: string;
}

class VerifyOtpDto {
  @IsString()
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    const challenge = this.authService.requestOtp(dto.phone);
    return { challengeId: challenge.challengeId, expiresAt: challenge.expiresAt };
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.challengeId, dto.code);
  }
}
