import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_branding_runtime/branding_runtime.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';

Map<String, dynamic> contextFor(String societyId, {String? revision}) => {
  'society': {'id': societyId, 'name': 'Green Society'},
  'branding': {
    'schemaVersion': 1,
    'revision': revision ?? 'society-$societyId-v2',
    'brand': {
      'id': 'aaraagate',
      'displayName': 'Lake Gardens',
      'colors': {'primary': '#155E75', 'primaryDeep': '#164E63'},
    },
  },
  'entitlements': {'enabledFeatures': ['NOTICES']},
};

void main() {
  test('parses safe support contacts for the selected society and rejects injected URLs', () {
    const societyId='11111111-1111-4111-8111-111111111111';
    final response=contextFor(societyId);
    (response['branding']['brand'] as Map)['support']={'email':'help@example.com','phone':'+919876543210'};
    final parsed=SocietyBrandTokens.tryParseContext(response,societyId:societyId);
    expect(parsed?.supportEmail,'help@example.com');
    expect(parsed?.supportPhone,'+919876543210');
    (response['branding']['brand']['support'] as Map)['logoUrl']='https://untrusted.example';
    expect(SocietyBrandTokens.tryParseContext(response,societyId:societyId),isNull);
  });


  test('parses only selected society and supported revision contract', () {
    const societyId = '11111111-1111-4111-8111-111111111111';
    final response = contextFor(societyId);
    final tokens = SocietyBrandTokens.tryParseContext(response, societyId: societyId);
    expect(tokens, isNotNull);
    expect(tokens!.revision, 'society-$societyId-v2');
    expect(tokens.displayName, 'Lake Gardens');
    expect(tokens.primaryArgb, 0xFF155E75);
    expect(tokens.primaryDeepArgb, 0xFF164E63);
    expect(tokens.onPrimaryDeepArgb, 0xFFFFFFFF);
    expect(SocietyBrandTokens.tryParseContext(response,
      societyId:'22222222-2222-4222-8222-222222222222'), isNull);
    expect(SocietyBrandTokens.tryParseContext({'branding':response['branding']},
      societyId:societyId), isNull);
  });

  test('rejects feature-bearing styling, invalid colors and unsupported schema', () {
    const societyId = '11111111-1111-4111-8111-111111111111';
    final wrongFeature = contextFor(societyId);
    (wrongFeature['branding']['brand'] as Map)['css'] = 'body {display:none}';
    expect(SocietyBrandTokens.tryParseContext(wrongFeature,societyId:societyId), isNull);
    final wrongColor = contextFor(societyId);
    (wrongColor['branding']['brand']['colors'] as Map)['primary'] = 'red';
    expect(SocietyBrandTokens.tryParseContext(wrongColor,societyId:societyId), isNull);
    final wrongVersion = contextFor(societyId);
    wrongVersion['branding']['schemaVersion'] = 2;
    expect(SocietyBrandTokens.tryParseContext(wrongVersion,societyId:societyId), isNull);
    expect(SocietyBrandTokens.tryParseContext(null,societyId:societyId), isNull);
  });

  test('maintains exact default light and dark colors without runtime config', () {
    expect(AaraagateTheme.light().colorScheme.primary, const Color(0xFF05879A));
    expect(AaraagateTheme.dark().colorScheme.primary, const Color(0xFF55D5E1));
    expect(AaraagateTheme.light().colorScheme.secondary, const Color(0xFF0EABBE));
  });

  test('changes only theme presentation and preserves readable foreground', () {
    const societyId = '11111111-1111-4111-8111-111111111111';
    final tokens = SocietyBrandTokens.tryParseContext(contextFor(societyId),societyId:societyId)!;
    final light = AaraagateTheme.light(societyBrand:tokens);
    final dark = AaraagateTheme.dark(societyBrand:tokens);
    expect(light.colorScheme.primary, const Color(0xFF164E63));
    expect(light.colorScheme.secondary, const Color(0xFF155E75));
    expect(light.colorScheme.onPrimary, const Color(0xFFFFFFFF));
    expect(dark.colorScheme.primary, const Color(0xFF155E75));
    expect(dark.colorScheme.onPrimary, const Color(0xFFFFFFFF));
    expect(AaraagateTheme.light().colorScheme.primary, const Color(0xFF05879A));
  });
  test('accepts partner presentation revision without changing selected society identity',(){
    final id='11111111-1111-4111-8111-111111111111';
    final payload={'society':{'id':id},'branding':{'schemaVersion':1,'revision':'society-$id-v0-p2','brand':{'id':'aaraagate','displayName':'Partner One','colors':{'primary':'#155E75','primaryDeep':'#164E63'}}}};
    final result=SocietyBrandTokens.tryParseContext(payload,societyId:id);
    expect(result?.revision,'society-$id-v0-p2');
    expect(SocietyBrandTokens.tryParseContext(payload,societyId:'other'),isNull);
  });
}
