import type { Prisma } from '@prisma/client';

export const workforceUnitScope = (societyId: string) => ({
  societyId, building: { is: { societyId } },
}) satisfies Prisma.UnitWhereInput;

export const workforceAssignmentScope = (societyId: string) => ({
  societyId,
  worker: { is: { societyId } },
  household: { is: { societyId, unit: { is: workforceUnitScope(societyId) } } },
}) satisfies Prisma.WorkforceAssignmentWhereInput;
