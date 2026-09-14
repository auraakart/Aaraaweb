import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { calculateUtilityCharge } from './utility-charges.service';

describe('calculateUtilityCharge', () => {
  it('calculates progressive slabs plus fixed charge', () => {
    expect(calculateUtilityCharge(15, [
      { fromUnit: 0, toUnit: 10, ratePaisePerUnit: 500 },
      { fromUnit: 10, toUnit: null, ratePaisePerUnit: 750 },
    ], 2500, 0)).toEqual({
      consumption: 15,
      variableChargePaise: 8750,
      fixedChargePaise: 2500,
      minimumChargePaise: 0,
      totalPaise: 11250,
      breakdown: [
        { fromUnit: 0, toUnit: 10, units: 10, ratePaisePerUnit: 500, chargePaise: 5000 },
        { fromUnit: 10, toUnit: null, units: 5, ratePaisePerUnit: 750, chargePaise: 3750 },
      ],
    });
  });

  it('applies the minimum charge after variable and fixed components', () => {
    const result = calculateUtilityCharge(2, [
      { fromUnit: 0, toUnit: null, ratePaisePerUnit: 100 },
    ], 0, 1000);
    expect(result.variableChargePaise).toBe(200);
    expect(result.totalPaise).toBe(1000);
  });

  it('rounds the aggregate variable charge to paise deterministically', () => {
    const result = calculateUtilityCharge(1.25, [
      { fromUnit: 0, toUnit: null, ratePaisePerUnit: 333 },
    ], 0, 0);
    expect(result.variableChargePaise).toBe(416);
    expect(result.totalPaise).toBe(416);
  });

  it('rejects negative consumption', () => {
    expect(() => calculateUtilityCharge(-1, [
      { fromUnit: 0, toUnit: null, ratePaisePerUnit: 100 },
    ], 0, 0)).toThrow(BadRequestException);
  });
});
