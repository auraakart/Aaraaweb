import { SetMetadata } from '@nestjs/common';
import { AppRole } from './auth.types';

export const ROLES_KEY = 'aaraagate_roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
