import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_branding_runtime/branding_runtime.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';

void main() {
  test('keeps existing Guard dark/light identity and minimum touch target', () {
    expect(AaraagateGuardTheme.light().colorScheme.primary,const Color(0xFF05879A));
    expect(AaraagateGuardTheme.dark().colorScheme.primary,const Color(0xFF55D5E1));
    expect(AaraagateGuardTokens.minTouchTarget,56);
    expect(AaraagateGuardTokens.primaryActionHeight,64);
  });

  test('uses validated selected-society tokens without changing guard ergonomics', () {
    const societyId='11111111-1111-4111-8111-111111111111';
    final tokens=SocietyBrandTokens.tryParseContext({
      'society':{'id':societyId},
      'branding':{
        'schemaVersion':1,'revision':'society-$societyId-v1',
        'brand':{'id':'aaraagate','displayName':'Garden Gate',
          'colors':{'primary':'#155E75','primaryDeep':'#164E63'}},
      },
    },societyId:societyId)!;
    final light=AaraagateGuardTheme.light(societyBrand:tokens);
    final dark=AaraagateGuardTheme.dark(societyBrand:tokens);
    expect(light.colorScheme.primary,const Color(0xFF164E63));
    expect(light.colorScheme.onPrimary,const Color(0xFFFFFFFF));
    expect(dark.colorScheme.primary,const Color(0xFF155E75));
    expect(AaraagateGuardTokens.minTouchTarget,56);
  });

  test('refuses a stale wrong-society context and falls back to builtin colors', () {
    const selected='11111111-1111-4111-8111-111111111111';
    final invalid=SocietyBrandTokens.tryParseContext({
      'society':{'id':'22222222-2222-4222-8222-222222222222'},
      'branding':{'schemaVersion':1,'revision':'society-$selected-v1',
        'brand':{'id':'aaraagate','displayName':'Wrong Society',
          'colors':{'primary':'#155E75','primaryDeep':'#164E63'}}},
    },societyId:selected);
    expect(invalid,isNull);
    expect(AaraagateGuardTheme.light(societyBrand:invalid).colorScheme.primary,
      const Color(0xFF05879A));
  });
}
