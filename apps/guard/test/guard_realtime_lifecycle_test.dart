import 'dart:async';

import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class _RealtimeApi extends GuardApi {
  _RealtimeApi() : super(baseUrl:'http://test');

  int subscriptions=0;
  int logoutCalls=0;
  final List<StreamController<Map<String,dynamic>>> controllers=[];

  @override
  Stream<Map<String,dynamic>> gateEvents() {
    subscriptions++;
    final controller=StreamController<Map<String,dynamic>>();
    controllers.add(controller);
    return controller.stream;
  }

  @override
  Future<void> logout(String sessionId,String refreshToken) async {
    logoutCalls++;
  }
}

class _MemorySessions extends GuardSessionStore {
  const _MemorySessions();

  @override
  Future<void> clear() async {}
}

class _MemoryQueue extends OfflineActionQueue {
  @override
  Future<List<QueuedGateAction>> read() async => const [];
  @override
  Future<void> enqueue(QueuedGateAction action) async {}
  @override
  Future<void> replace(List<QueuedGateAction> actions) async {}
}

const _session=GuardSession(
  sessionId:'session-1',
  accessToken:'token',
  refreshToken:'refresh',
  userId:'guard-1',
  societyId:'society-1',
);

GuardController _controller(_RealtimeApi api)=>GuardController(
  api:api,
  sessions:const _MemorySessions(),
  offlineQueue:_MemoryQueue(),
  realtimeReconnectDelay:const Duration(milliseconds:10),
)..session=_session;

void main(){
  test('realtime failure schedules only one reconnect',() async {
    final api=_RealtimeApi();
    final controller=_controller(api);

    controller.startRealtime();
    expect(api.subscriptions,1);
    api.controllers.single.addError(StateError('offline'));
    await Future<void>.delayed(const Duration(milliseconds:3));
    expect(api.subscriptions,1);

    await Future<void>.delayed(const Duration(milliseconds:20));
    expect(api.subscriptions,2);

    controller.dispose();
    for(final stream in api.controllers){
      if(!stream.isClosed) await stream.close();
    }
  });

  test('dispose cancels a scheduled realtime reconnect',() async {
    final api=_RealtimeApi();
    final controller=_controller(api);

    controller.startRealtime();
    api.controllers.single.addError(StateError('offline'));
    await Future<void>.delayed(const Duration(milliseconds:2));
    controller.dispose();

    await Future<void>.delayed(const Duration(milliseconds:20));
    expect(api.subscriptions,1);
    for(final stream in api.controllers){
      if(!stream.isClosed) await stream.close();
    }
  });

  test('sign out cancels a scheduled realtime reconnect',() async {
    final api=_RealtimeApi();
    final controller=_controller(api);

    controller.startRealtime();
    api.controllers.single.addError(StateError('offline'));
    await Future<void>.delayed(const Duration(milliseconds:2));
    await controller.signOut();

    await Future<void>.delayed(const Duration(milliseconds:20));
    expect(api.subscriptions,1);
    expect(api.logoutCalls,1);
    controller.dispose();
    for(final stream in api.controllers){
      if(!stream.isClosed) await stream.close();
    }
  });
}
