import { SetMetadata } from '@nestjs/common';
import { AppPermission } from './permission.types';

export const PERMISSIONS_KEY = 'aaraagate.permissions';

export const RequiresPermissions = (...permissions: AppPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
