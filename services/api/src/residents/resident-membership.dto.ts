import { IsEnum, IsUUID } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class CreateResidentMembershipDto {
  @IsUUID() userId!: string;
  @IsEnum(MembershipRole) role!: MembershipRole;
}
