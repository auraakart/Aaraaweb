import { SetMetadata } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

export const GATE_ROLES_KEY = 'gate_roles';
export const GateRoles = (...roles: MembershipRole[]) => SetMetadata(GATE_ROLES_KEY, roles);
