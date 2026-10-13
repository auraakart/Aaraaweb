import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_branding_runtime/society_logo_fetcher.dart';
import 'package:aaraagate_resident/theme/resident_branding_controller.dart';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
class Scope extends ChangeNotifier {
  ResidentBrandSession? session;
  void use(ResidentBrandSession? next) { session=next;notifyListeners(); }
}
ResidentBrandSession auth(String id,String society)=>ResidentBrandSession(
  sessionId:id,societyId:society,accessToken:'token-$id');
Map<String,dynamic> context(String society)=> {
  'society':{'id':society},
  'branding':{'schemaVersion':1,'revision':'society-$society-v1',
    'brand':{'id':'aaraagate','displayName':'Society',
      'colors':{'primary':'#155E75','primaryDeep':'#164E63'}}},
};
Future<void> settle()=>Future<void>.delayed(Duration.zero);

void main(){
  test('bounded PNG header rejects SVG, truncated or giant mobile images',(){
    expect(validSocietyLogoPngHeader(Uint8List(20)),false);
    final header=Uint8List(57);
    header.setRange(0,8,[137,80,78,71,13,10,26,10]);
    header.setRange(12,16,'IHDR'.codeUnits);
    header[19]=64;header[23]=64;header[24]=8;header[25]=6;
    expect(validSocietyLogoPngHeader(header),true);
    header[25]=1;
    expect(validSocietyLogoPngHeader(header),false);
    expect(validSocietyLogoPngHeader(Uint8List(maxSocietyLogoBytes+1)),false);
  });
  test('late logo from a previous society never reaches the new session',() async {
    final scope=Scope();
    final awaiting=<String,Completer<Uint8List?>>{};
    final branding=ResidentBrandingController(
      scopeChanges:scope,currentSession:()=>scope.session,
      fetchContext:(session) async=>context(session.societyId),
      fetchLogo:(session) {
        final c=Completer<Uint8List?>();
        awaiting[session.societyId]=c;
        return c.future;
      },
    );
    scope.use(auth('one',a));
    await settle();
    expect(branding.logoBytes,isNull);
    scope.use(auth('two',b));
    expect(branding.current,isNull);
    expect(branding.logoBytes,isNull);
    await settle();
    awaiting[b]!.complete(Uint8List.fromList([2,3,4]));
    await settle();
    expect(branding.logoBytes,Uint8List.fromList([2,3,4]));
    awaiting[a]!.complete(Uint8List.fromList([1,2,3]));
    await settle();
    expect(branding.logoBytes,Uint8List.fromList([2,3,4]));
    scope.use(null);
    expect(branding.current,isNull);
    expect(branding.logoBytes,isNull);
    branding.dispose();scope.dispose();
  });
  test('logo fetch fails open to default with no login or entitlement mutation',() async {
    final scope=Scope();
    final branding=ResidentBrandingController(
      scopeChanges:scope,currentSession:()=>scope.session,
      fetchContext:(session) async=>context(session.societyId),
      fetchLogo:(_)=>Future<Uint8List?>.error(StateError('offline')),
    );
    scope.use(auth('one',a));
    await settle();
    await settle();
    expect(branding.current?.displayName,'Society');
    expect(branding.logoBytes,isNull);
    branding.dispose();scope.dispose();
  });
}
