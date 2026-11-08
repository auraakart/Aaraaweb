import { BadRequestException } from '@nestjs/common';

/**
 * Canonicalize the formats accepted by the Resident client and validate again
 * at the trust boundary. This is deliberately format validation, not an RTO
 * lookup: BH-series and other valid registrations must remain supported.
 */
export function normalizeAndValidateVehiclePlate(value: string): string {
  const plate = value.trim().toUpperCase().replace(/[\\s-]+/g, '');
  if (!/^[A-Z0-9]{4,16}$/.test(plate) || !/[A-Z]/.test(plate) || !/[0-9]/.test(plate)) {
    throw new BadRequestException('Use 4–16 registration letters and digits.');
  }
  return plate;
}
