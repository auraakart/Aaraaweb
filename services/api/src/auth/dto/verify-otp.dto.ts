import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{9,14}$/)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  @MinLength(6)
  @MaxLength(6)
  otp!: string;
}
