import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { normalizeAndValidateVehiclePlate } from './vehicle-plate.validation';

describe('normalizeAndValidateVehiclePlate', () => {
  it.each([
    ['ka 01-ab-1234', 'KA01AB1234'],
    ['22 BH 1234 AA', '22BH1234AA'],
    ['DL 8C 1234', 'DL8C1234'],
  ])('normalizes valid registration %s', (input, expected) => {
    expect(normalizeAndValidateVehiclePlate(input)).toBe(expected);
  });

  it('preserves the required-registration message for blank input', () => {
    expect(() => normalizeAndValidateVehiclePlate(' - ')).toThrow('Vehicle registration number is required');
  });

  it.each(['12345678', 'ABCDEFGH', 'TN01?ABC', '++91ABC123', 'A'.repeat(17)])(
    'rejects invalid registration %s',
    (input) => {
      expect(() => normalizeAndValidateVehiclePlate(input)).toThrow(BadRequestException);
    },
  );
});
