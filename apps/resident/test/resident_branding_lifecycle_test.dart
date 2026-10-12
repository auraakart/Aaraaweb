import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/theme/resident_branding_controller.dart';

const societyA = '11111111-1111-4111-8111-111111111111';
const societyB = '22222222-2222-4222-8222-222222222222';

class SessionSignal extends ChangeNotifier {
  ResidentBrandSession? session;
  void switchTo(ResidentBrandSession? next) {
    session = next;
    notifyListeners();
  }
}

ResidentBrandSession identity(String id, String society, {String token = 'token'}) =>
    ResidentBrandSession(sessionId:id, societyId:society, accessToken:token);

Map<String, dynamic> brand(String society, String name) => {
  'society':{'id':society},
  'branding':{
    'schemaVersion':1,
    'revision':'society-$society-v1',
    'brand':{'id':'aaraagate','displayName':name,
      'colors':{'primary':'#155E75','primaryDeep':'#164E63'}},
  },
};

Future<void> settle() => Future<void>.delayed(Duration.zero);

void main() {
  test('displays validated branding only for the current selected society',() async {
    final signal=SessionSignal();
    final pending=<String,Completer<Object?>>{};
    final controller=ResidentBrandingController(
      scopeChanges:signal,
      currentSession:()=>signal.session,
      fetchContext:(session){
        final completer=Completer<Object?>();
        pending[session.societyId]=completer;
        return completer.future;
      },
    );
    signal.switchTo(identity('session-a',societyA));
    expect(controller.current,isNull);
    signal.switchTo(identity('session-b',societyB));
    expect(controller.current,isNull);
    pending[societyB]!.complete(brand(societyB,'Society B'));
    await settle();
    expect(controller.current?.displayName,'Society B');
    pending[societyA]!.complete(brand(societyA,'Society A'));
    await settle();
    expect(controller.current?.displayName,'Society B');
    controller.dispose();
    signal.dispose();
  });

  test('clears previous presentation immediately on sign-out or independent-home selection',() async {
    final signal=SessionSignal();
    final controller=ResidentBrandingController(
      scopeChanges:signal,currentSession:()=>signal.session,
      fetchContext:(session) async=>brand(session.societyId,'Active Society'),
    );
    signal.switchTo(identity('session-a',societyA));
    await settle();
    expect(controller.current?.displayName,'Active Society');
    signal.switchTo(null);
    expect(controller.current,isNull);
    controller.dispose();
    signal.dispose();
  });

  test('does not apply late sign-out response even when it resolves successfully',() async {
    final signal=SessionSignal();
    final pending=Completer<Object?>();
    final controller=ResidentBrandingController(
      scopeChanges:signal,currentSession:()=>signal.session,
      fetchContext:(_)=>pending.future,
    );
    signal.switchTo(identity('session-a',societyA));
    signal.switchTo(null);
    pending.complete(brand(societyA,'Old Society'));
    await settle();
    expect(controller.current,isNull);
    controller.dispose();
    signal.dispose();
  });

  test('rejects a cross-society response and retains default theme',() async {
    final signal=SessionSignal();
    final controller=ResidentBrandingController(
      scopeChanges:signal,currentSession:()=>signal.session,
      fetchContext:(_)=>Future.value(brand(societyB,'Foreign Society')),
    );
    signal.switchTo(identity('session-a',societyA));
    await settle();
    expect(controller.current,isNull);
    controller.dispose();
    signal.dispose();
  });

  test('falls back on transport failure and avoids retries or auth changes',() async {
    final signal=SessionSignal();
    var calls=0;
    final controller=ResidentBrandingController(
      scopeChanges:signal,currentSession:()=>signal.session,
      fetchContext:(_){calls++;return Future<Object?>.error(StateError('offline'));}
    );
    signal.switchTo(identity('session-a',societyA));
    await settle();
    expect(controller.current,isNull);
    expect(calls,1);
    controller.dispose();
    signal.dispose();
  });

  test('refreshes presentation on new credential and ignores stale earlier token',() async {
    final signal=SessionSignal();
    final old=Completer<Object?>(), next=Completer<Object?>();
    final controller=ResidentBrandingController(
      scopeChanges:signal,currentSession:()=>signal.session,
      fetchContext:(session)=>session.accessToken=='old' ? old.future : next.future,
    );
    signal.switchTo(identity('session-a',societyA,token:'old'));
    signal.switchTo(identity('session-a',societyA,token:'new'));
    old.complete(brand(societyA,'Old Token'));
    await settle();
    expect(controller.current,isNull);
    next.complete(brand(societyA,'New Token'));
    await settle();
    expect(controller.current?.displayName,'New Token');
    controller.dispose();
    signal.dispose();
  });

  test('foreground refresh picks up a published society revision without session change',() async {
    final signal=SessionSignal();
    var calls=0;
    final controller=ResidentBrandingController(
      scopeChanges:signal,currentSession:()=>signal.session,
      fetchContext:(_){calls++;return Future.value(brand(societyA,calls==1?'Old name':'Published update'));},
    );
    signal.switchTo(identity('session-a',societyA));
    await settle();
    expect(controller.current?.displayName,'Old name');
    controller.refresh();
    await settle();
    expect(controller.current?.displayName,'Published update');
    expect(calls,2);
    controller.dispose();signal.dispose();
  });

  test('failed foreground refresh retains same-session appearance but sign-out clears it',() async {
    final signal=SessionSignal();
    var calls=0;
    final controller=ResidentBrandingController(
      scopeChanges:signal,currentSession:()=>signal.session,
      fetchContext:(_){
        calls++;
        return calls==1?Future.value(brand(societyA,'Verified')):Future.error(StateError('offline'));
      },
    );
    signal.switchTo(identity('session-a',societyA));
    await settle();
    controller.refresh();
    await settle();
    expect(controller.current?.displayName,'Verified');
    signal.switchTo(null);
    expect(controller.current,isNull);
    controller.refresh();
    expect(calls,2);
    controller.dispose();signal.dispose();
  });

  test('late foreground response cannot repaint newly selected society',() async {
    final signal=SessionSignal();
    final pending=Completer<Object?>();
    var aCalls=0;
    final controller=ResidentBrandingController(
      scopeChanges:signal,currentSession:()=>signal.session,
      fetchContext:(session) {
        if(session.societyId==societyB)return Future.value(brand(societyB,'Society B'));
        aCalls++;
        return aCalls==1?Future.value(brand(societyA,'Society A')):pending.future;
      },
    );
    signal.switchTo(identity('session-a',societyA));
    await settle();
    controller.refresh();
    signal.switchTo(identity('session-b',societyB));
    await settle();
    expect(controller.current?.displayName,'Society B');
    pending.complete(brand(societyA,'Late old brand'));
    await settle();
    expect(controller.current?.displayName,'Society B');
    controller.dispose();signal.dispose();
  });

}
