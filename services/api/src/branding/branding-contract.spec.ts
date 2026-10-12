import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { onBrandColor, societyBrandDigest, validateSocietyBrandPresentation } from './branding-contract';

describe('V5.3.1 strict runtime society-brand contract', () => {
  it('normalizes presentation-only fields and canonical color values', () => {
    expect(validateSocietyBrandPresentation({
      displayName: '  Green Heights  ',
      colors: {primary:'#155e75',primaryDeep:'#164e63'},
    })).toEqual({displayName:'Green Heights',colors:{primary:'#155E75',primaryDeep:'#164E63'}});
  });

  it.each([
    null, [], {}, {displayName:''}, {displayName:' '}, {displayName:'x'.repeat(81)},
    {displayName:'<script>alert(1)</script>'}, {displayName:'A\nB'},
    {colors:{primary:'#ffffff'}}, {colors:{primary:'#155E75',primaryDeep:'red'}},
    {colors:{primary:'#155E75',primaryDeep:'#123456',onPrimary:'#ffffff'}},
    {css:'body {display:none}'}, {features:['MAINTENANCE']}, {roles:['SUPER_ADMIN']},
    {partnerId:'00000000-0000-4000-8000-000000000001'}, {logoUrl:'https://example.com'},
    {displayName:'Hello',supportEmail:'help@example.com'},
    {support:{}}, {support:{email:'invalid'}}, {support:{email:'help@x.com',secret:'x'}},
    {support:{phone:'9876543210'}}, {support:{phone:'+000000000'}},
    {support:{email:'help@sample.com',url:'https://example.com'}},
    {displayName:'Hello',colors:[]},
  ])('rejects unsupported, unsafe or capability-bearing values %#', input => {
    expect(() => validateSocietyBrandPresentation(input)).toThrow(BadRequestException);
  });

  it('accepts normalized contact-only metadata without granting features or accepting URLs', () => {
    const data = validateSocietyBrandPresentation({
      displayName:'Lake Heights',support:{email:'  Help@Example.COM ',phone:' +919876543210 '},
    });
    expect(data).toEqual({displayName:'Lake Heights',
      support:{email:'help@example.com',phone:'+919876543210'}});
    const reordered=validateSocietyBrandPresentation({support:{phone:'+919876543210',email:'help@example.com'},displayName:'Lake Heights'});
    expect(societyBrandDigest(reordered)).toBe(societyBrandDigest(data));
    expect(societyBrandDigest({displayName:'Lake Heights'})).not.toBe(societyBrandDigest(data));
  });

  it('produces the same digest regardless of input key order and hex case', () => {
    const a = {displayName:'Palm',colors:{primary:'#155e75',primaryDeep:'#164e63'}};
    const b = {colors:{primaryDeep:'#164E63',primary:'#155E75'},displayName:'Palm'};
    expect(societyBrandDigest(a)).toBe(societyBrandDigest(b));
    expect(societyBrandDigest(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(societyBrandDigest({displayName:'Elsewhere'})).not.toBe(societyBrandDigest(a));
  });

  it('always selects a WCAG contrast-safe primary text foreground', () => {
    expect(onBrandColor('#FFFFFF')).toBe('#000000');
    expect(onBrandColor('#000000')).toBe('#FFFFFF');
    expect(onBrandColor('#0EABBE')).toBe('#000000');
    expect(() => onBrandColor('red')).toThrow(BadRequestException);
  });
});
