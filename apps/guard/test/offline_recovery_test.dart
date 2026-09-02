import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeGuardApi extends GuardApi {
  FakeGuardApi() : super(baseUrl: 'http://test');
  GuardApiException? failure;
  final calls = <String>[];

  @override
  Future<Map<String, dynamic>> checkIn(String gateId, String credential, String idempotencyKey) async {
    calls.add('IN:$gateId:$credential:$idempotencyKey');
    if (failure != null) throw failure!;
    return {'status': 'CHECKED_IN'};
  }

  @override
  Future<Map<String, dynamic>> checkOut(String gateId, String credential, String idempotencyKey) async {
    calls.add('OUT:$gateId:$credential:$idempotencyKey');
    if (failure != null) throw failure!;
    return {'status': 'CHECKED_OUT'};
  }
}

class MemoryQueue extends OfflineActionQueue {
  MemoryQueue([List<QueuedGateAction>? seed]) : items = [...?seed];
  List<QueuedGateAction> items;

  @override
  Future<List<QueuedGateAction>> read() async => List.unmodifiable(items);
  @override
  Future<void> enqueue(QueuedGateAction action) async {
    if (!items.any((item) => item.idempotencyKey == action.idempotencyKey)) items.add(action);
  }
  @override
  Future<void> replace(List<QueuedGateAction> actions) async => items = [...actions];
}

QueuedGateAction action(String key) => QueuedGateAction(
  type: 'CHECK_IN', gateId: 'gate-1', credential: 'pass-1', idempotencyKey: key,
  createdAt: DateTime.utc(2026, 9, 2),
);

void main() {
  test('queues a gate mutation when transport is unavailable', () async {
    final api = FakeGuardApi()..failure = GuardApiException('offline', transport: true);
    final queue = MemoryQueue();
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..gateId = 'gate-1';

    await controller.checkIn('pass-1');

    expect(queue.items, hasLength(1));
    expect(controller.queuedActions, 1);
    expect(controller.error, contains('saved and will sync safely'));
  });

  test('retry preserves the original idempotency key and clears a successful action', () async {
    final api = FakeGuardApi();
    final queue = MemoryQueue([action('stable-key')]);
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..queuedActions = 1;

    await controller.retryQueuedActions();

    expect(api.calls.single, endsWith(':stable-key'));
    expect(queue.items, isEmpty);
    expect(controller.queuedActions, 0);
    expect(controller.offlineSyncMessage, '1 offline action synced.');
  });

  test('retains a server-rejected action for supervisor review', () async {
    final api = FakeGuardApi()..failure = GuardApiException('expired', statusCode: 409);
    final queue = MemoryQueue([action('review-key')]);
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..queuedActions = 1;

    await controller.retryQueuedActions();

    expect(queue.items, hasLength(1));
    expect(controller.queuedActions, 1);
    expect(controller.offlineSyncMessage, contains('retained for supervisor review'));
  });
}
