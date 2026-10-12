import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/theme/guard_branding_controller.dart';

const societyA='11111111-1111-4111-8111-111111111111';
const societyB='22222222-2222-4222-8222-222222222222';

class SessionSignal extends ChangeNotifier {
  GuardSession? session;
  void use(GuardSession? value) {session=value;notifyListeners();}
}
GuardSession active(String id,String society,{String token='token'})=>
    GuardSession(sessionId:id,accessToken:token,refreshToken:'refresh',userId:'guard',societyId:society);
Map<String,dynamic> context(String society,String name)=> {
  'society':{'id':society},
  'branding':{'schemaVersion':1,'revision':'society-$society-v1',
    'brand':{'id':'aaraagate','displayName':name,
      'colors':{'primary':'#155E75','primaryDeep':'#164E63'}}},
};
Future<void> settle()=>Future<void>.delayed(Duration.zero);

void main(){
  test('uses the current guard society, never a late prior-society response',() async {
    final signal=SessionSignal();
    final a=Completer<Object?>(),b=Completer<Object?>();
    final controller=GuardBrandingController(sessionChanges:signal,
      currentSession:()=>signal.session,
      fetchContext:(session)=>session.societyId==societyA?a.future:b.future);
    signal.use(active('one',societyA));
    signal.use(active('two',societyB));
    b.complete(context(societyB,'B Tower'));
    await settle();
    expect(controller.current?.displayName,'B Tower');
    a.complete(context(societyA,'Old A'));
    await settle();
    expect(controller.current?.displayName,'B Tower');
    controller.dispose();signal.dispose();
  });

  test('clears prior theme synchronously on signout and ignores completed request',() async {
    final signal=SessionSignal(),pending=Completer<Object?>();
    final controller=GuardBrandingController(sessionChanges:signal,
      currentSession:()=>signal.session,fetchContext:(_)=>pending.future);
    signal.use(active('one',societyA));
    signal.use(null);
    expect(controller.current,isNull);
    pending.complete(context(societyA,'Former Guard'));
    await settle();
    expect(controller.current,isNull);
    controller.dispose();signal.dispose();
  });

  test('rejects a response from the wrong society and uses exact default',() async {
    final signal=SessionSignal();
    final controller=GuardBrandingController(sessionChanges:signal,
      currentSession:()=>signal.session,
      fetchContext:(_)=>Future<Object?>.value(context(societyB,'Foreign')));
    signal.use(active('one',societyA));
    await settle();
    expect(controller.current,isNull);
    controller.dispose();signal.dispose();
  });

  test('falls back after network failure, without modifying sign-in or queue state',() async {
    final signal=SessionSignal();
    var requests=0;
    final controller=GuardBrandingController(sessionChanges:signal,
      currentSession:()=>signal.session,fetchContext:(_){requests++;throw StateError('offline');});
    signal.use(active('one',societyA));
    await settle();
    expect(controller.current,isNull);
    expect(requests,1);
    controller.dispose();signal.dispose();
  });

  test('refreshes once on credential rotation, rejecting the prior response',() async {
    final signal=SessionSignal();
    final old=Completer<Object?>(),fresh=Completer<Object?>();
    final controller=GuardBrandingController(sessionChanges:signal,
      currentSession:()=>signal.session,
      fetchContext:(session)=>session.accessToken=='expired'?old.future:fresh.future);
    signal.use(active('same-session',societyA,token:'expired'));
    signal.use(active('same-session',societyA,token:'new'));
    expect(controller.current,isNull);
    old.complete(context(societyA,'Expired'));
    await settle();
    expect(controller.current,isNull);
    fresh.complete(context(societyA,'Fresh'));
    await settle();
    expect(controller.current?.displayName,'Fresh');
    controller.dispose();signal.dispose();
  });

  test('does not fetch when signed-out or notify after disposal',() async {
    final signal=SessionSignal();
    var fetches=0;
    final controller=GuardBrandingController(sessionChanges:signal,
      currentSession:()=>signal.session,fetchContext:(_){fetches++;return Future.value(null);});
    expect(fetches,0);
    controller.dispose();
    signal.use(active('one',societyA));
    await settle();
    expect(fetches,0);
    signal.dispose();
  });

  test('foreground refresh adopts newly published colors without logging out the guard',() async {
    final signal=SessionSignal();
    var calls=0;
    final controller=GuardBrandingController(
      sessionChanges:signal,currentSession:()=>signal.session,
      fetchContext:(_){calls++;return Future.value(context(societyA,calls==1?'Old guard brand':'New guard brand'));},
    );
    signal.use(active('session-a',societyA));
    await settle();
    expect(controller.current?.displayName,'Old guard brand');
    controller.refresh();
    await settle();
    expect(controller.current?.displayName,'New guard brand');
    expect(calls,2);
    controller.dispose();signal.dispose();
  });

  test('network failure on resume preserves valid same-session guard theme only',() async {
    final signal=SessionSignal();
    var calls=0;
    final controller=GuardBrandingController(
      sessionChanges:signal,currentSession:()=>signal.session,
      fetchContext:(_){
        calls++;
        return calls==1?Future.value(context(societyA,'Verified')):Future.error(StateError('offline'));
      },
    );
    signal.use(active('session-a',societyA));
    await settle();
    controller.refresh();
    await settle();
    expect(controller.current?.displayName,'Verified');
    signal.use(null);
    expect(controller.current,isNull);
    controller.refresh();
    expect(calls,2);
    controller.dispose();signal.dispose();
  });

  test('late guard foreground refresh never crosses to another authenticated society',() async {
    final signal=SessionSignal();
    final pending=Completer<Object?>();
    var aCalls=0;
    final controller=GuardBrandingController(
      sessionChanges:signal,currentSession:()=>signal.session,
      fetchContext:(session){
        if(session.societyId==societyB)return Future.value(context(societyB,'Current society'));
        aCalls++;
        return aCalls==1?Future.value(context(societyA,'Old current')):pending.future;
      },
    );
    signal.use(active('session-a',societyA));
    await settle();
    controller.refresh();
    signal.use(active('session-b',societyB));
    await settle();
    expect(controller.current?.displayName,'Current society');
    pending.complete(context(societyA,'Late wrong society'));
    await settle();
    expect(controller.current?.displayName,'Current society');
    controller.dispose();signal.dispose();
  });

}
