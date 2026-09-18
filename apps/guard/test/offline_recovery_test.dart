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
    if (!items.any((item) =>
        item.belongsTo(societyId: action.societyId, guardUserId: action.guardUserId) &&
        item.idempotencyKey == action.idempotencyKey)) {
      items.add(action);
    }
  }
  @override
  Future<void> replace(List<QueuedGateAction> actions) async => items = [...actions];
}

QueuedGateAction action(String key, {DateTime? createdAt}) => QueuedGateAction(
  type: 'CHECK_IN', gateId: 'gate-1', credential: 'pass-1', idempotencyKey: key,
  createdAt: createdAt ?? DateTime.now().toUtc().subtract(const Duration(minutes: 1)),
  societyId: 'society-1', guardUserId: 'guard-1',
);

const session = GuardSession(
  sessionId: 'session-1', accessToken: 'token', refreshToken: 'refresh', userId: 'guard-1', societyId: 'society-1',
);

void main() {
  test('queues a gate mutation when transport is unavailable', () async {
    final api = FakeGuardApi()..failure = GuardApiException('offline', transport: true);
    final queue = MemoryQueue();
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..gateId = 'gate-1'..session = session;

    await controller.checkIn('pass-1');

    expect(queue.items, hasLength(1));
    expect(controller.queuedActions, 1);
    expect(controller.error, contains('saved and will sync safely'));
  });

  test('retry preserves the original idempotency key and clears a successful action', () async {
    final api = FakeGuardApi();
    final queue = MemoryQueue([action('stable-key')]);
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..queuedActions = 1..session = session;

    await controller.retryQueuedActions();

    expect(api.calls.single, endsWith(':stable-key'));
    expect(queue.items, isEmpty);
    expect(controller.queuedActions, 0);
    expect(controller.offlineSyncMessage, '1 offline action synced.');
  });

  test('transport retry records bounded backoff without changing the idempotency key', () async {
    final api = FakeGuardApi()..failure = GuardApiException('offline', transport: true);
    final queue = MemoryQueue([action('backoff-key')]);
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..queuedActions = 1..session = session;

    await controller.retryQueuedActions();

    expect(queue.items, hasLength(1));
    expect(queue.items.single.idempotencyKey, 'backoff-key');
    expect(queue.items.single.attemptCount, 1);
    expect(queue.items.single.failureKind, 'TRANSPORT');
    expect(queue.items.single.nextAttemptAt, isNotNull);
    expect(queue.items.single.reviewRequired, isFalse);
  });

  test('marks a server conflict for supervisor review and does not treat it as retryable transport', () async {
    final api = FakeGuardApi()..failure = GuardApiException('expired', statusCode: 409);
    final queue = MemoryQueue([action('review-key')]);
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..queuedActions = 1..session = session;

    await controller.retryQueuedActions();

    expect(queue.items, hasLength(1));
    expect(queue.items.single.failureKind, 'CONFLICT');
    expect(queue.items.single.reviewRequired, isTrue);
    expect(controller.reviewRequiredActions, 1);
    expect(controller.offlineSyncMessage, contains('supervisor review'));
  });

  test('marks stale offline actions for review instead of replaying them', () async {
    final api = FakeGuardApi();
    final queue = MemoryQueue([action('stale-key', createdAt: DateTime.now().toUtc().subtract(const Duration(days: 31)))]);
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..queuedActions = 1..session = session;

    await controller.retryQueuedActions();

    expect(api.calls, isEmpty);
    expect(queue.items.single.failureKind, 'STALE');
    expect(queue.items.single.reviewRequired, isTrue);
  });

  test('does not replay or reveal actions belonging to another guard session', () async {
    final foreign = QueuedGateAction(
      type: 'CHECK_IN', gateId: 'gate-2', credential: 'foreign-pass', idempotencyKey: 'foreign-key',
      createdAt: DateTime.now().toUtc(), societyId: 'society-2', guardUserId: 'guard-2',
    );
    final api = FakeGuardApi();
    final queue = MemoryQueue([foreign, action('own-key')]);
    final controller = GuardController(api: api, sessions: const GuardSessionStore(), offlineQueue: queue)
      ..queuedActions = 1..session = session;

    await controller.retryQueuedActions();

    expect(api.calls, hasLength(1));
    expect(api.calls.single, contains('own-key'));
    expect(api.calls.single, isNot(contains('foreign-pass')));
    expect(queue.items, [foreign]);
    expect(controller.queuedActions, 0);
  });

  test('serializes retry metadata while remaining backward compatible with scoped legacy records', () {
    final decoded = QueuedGateAction.tryFromJson({
      'type': 'CHECK_IN', 'gateId': 'gate-1', 'credential': 'pass', 'idempotencyKey': 'key',
      'createdAt': DateTime.now().toUtc().toIso8601String(), 'societyId': 'society-1', 'guardUserId': 'guard-1',
    });
    expect(decoded, isNotNull);
    expect(decoded!.attemptCount, 0);
    expect(decoded.reviewRequired, isFalse);

    final retried = decoded.withRetryFailure(DateTime.now().toUtc());
    final restored = QueuedGateAction.tryFromJson(retried.toJson());
    expect(restored!.attemptCount, 1);
    expect(restored.failureKind, 'TRANSPORT');
    expect(restored.nextAttemptAt, isNotNull);
  });

  test('rejects legacy unscoped queue records', () {
    final decoded = QueuedGateAction.tryFromJson({
      'type': 'CHECK_IN', 'gateId': 'gate-1', 'credential': 'legacy-pass',
      'idempotencyKey': 'legacy-key', 'createdAt': '2026-09-02T00:00:00.000Z',
    });
    expect(decoded, isNull);
  });
}
