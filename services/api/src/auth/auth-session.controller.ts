import { Body, Controller, Post } from '@nestjs/common';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthSessionController {
  constructor(private readonly otp: OtpService, private readonly sessions: SessionService) {}

  @Post('session/request')
  request(@Body() dto: RequestOtpDto) { return this.otp.request(dto.phone); }

  @Post('session/verify')
  verify(@Body() dto: VerifyOtpDto) {
    const result = this.otp.verify(dto.challengeId, dto.code);
    return this.sessions.create(result.phone, undefined, []);
  }
}
