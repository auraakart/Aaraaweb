import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/theme/guard_branding_controller.dart';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
class Scope extends ChangeNotifier {
  GuardSession? session;
  void use(GuardSession? next) { session=next;notifyListeners(); }
}
GuardSession auth(String id,String society)=>GuardSession(
  sessionId:id,accessToken:'token-$id',refreshToken:'r',userId:'guard',societyId:society);
Map<String,dynamic> context(String society)=> {
  'society':{'id':society},
  'branding':{'schemaVersion':1,'revision':'society-$society-v1',
    'brand':{'id':'aaraagate','displayName':'Society',
      'colors':{'primary':'#155E75','primaryDeep':'#164E63'}}},
};
Future<void> settle()=>Future<void>.delayed(Duration.zero);

void main(){
  test('guard logo bytes clear synchronously and late old session never repaints',() async {
    final scope=Scope(), pending=<String,Completer<Uint8List?>>{};
    final controller=GuardBrandingController(
      sessionChanges:scope,currentSession:()=>scope.session,
      fetchContext:(session) async=>context(session.societyId),
      fetchLogo:(session) {
        final future=Completer<Uint8List?>();
        pending[session.societyId]=future;
        return future.future;
      },
    );
    scope.use(auth('a',a));
    await settle();
    scope.use(auth('b',b));
    expect(controller.logoBytes,isNull);
    await settle();
    pending[b]!.complete(Uint8List.fromList([5,6,7]));
    await settle();
    expect(controller.logoBytes,Uint8List.fromList([5,6,7]));
    pending[a]!.complete(Uint8List.fromList([1,2,3]));
    await settle();
    expect(controller.logoBytes,Uint8List.fromList([5,6,7]));
    scope.use(null);
    expect(controller.logoBytes,isNull);
    expect(controller.current,isNull);
    controller.dispose();scope.dispose();
  });
  test('guard retains validated theme when logo endpoint unavailable',() async {
    final scope=Scope();
    final controller=GuardBrandingController(
      sessionChanges:scope,currentSession:()=>scope.session,
      fetchContext:(session) async=>context(session.societyId),
      fetchLogo:(_)=>Future<Uint8List?>.error(StateError('offline')),
    );
    scope.use(auth('one',a));
    await settle();await settle();
    expect(controller.current?.displayName,'Society');
    expect(controller.logoBytes,isNull);
    controller.dispose();scope.dispose();
  });
}
