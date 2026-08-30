import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{9,14}$/)
  phone!: string;
}
