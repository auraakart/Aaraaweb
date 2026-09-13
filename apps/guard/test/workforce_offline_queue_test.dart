import 'dart:convert';

import 'package:aaraagate_guard/data/workforce_offline_queue.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('round-trips a scoped workforce action', () {
    final action = QueuedWorkforceAction.tryFromJson({
      'type': 'CHECK_IN',
      'gateId': 'gate-1',
      'assignmentId': 'assignment-1',
      'idempotencyKey': 'key-1',
      'createdAt': '2026-09-03T00:00:00.000Z',
      'societyId': 'society-1',
      'guardUserId': 'guard-1',
    });

    expect(action, isNotNull);
    expect(action!.belongsTo(societyId: 'society-1', guardUserId: 'guard-1'), isTrue);
    expect(action.belongsTo(societyId: 'society-2', guardUserId: 'guard-1'), isFalse);
    expect(action.toJson()['assignmentId'], 'assignment-1');
  });

  test('rejects legacy unscoped and malformed workforce actions', () {
    expect(QueuedWorkforceAction.tryFromJson({
      'type': 'CHECK_IN',
      'gateId': 'gate-1',
      'assignmentId': 'assignment-1',
      'idempotencyKey': 'legacy-key',
      'createdAt': '2026-09-03T00:00:00.000Z',
    }), isNull);
    expect(QueuedWorkforceAction.tryFromJson({
      'type': 'UNKNOWN',
      'gateId': 'gate-1',
      'assignmentId': 'assignment-1',
      'idempotencyKey': 'key-1',
      'createdAt': 'not-a-date',
      'societyId': 'society-1',
      'guardUserId': 'guard-1',
    }), isNull);
  });

  test('persists and deduplicates the same action within a guard session', () async {
    const queue = WorkforceOfflineQueue();
    final action = QueuedWorkforceAction(
      type: 'CHECK_IN',
      gateId: 'gate-1',
      assignmentId: 'assignment-1',
      idempotencyKey: 'idem-1',
      createdAt: DateTime.utc(2026, 9, 13, 12),
      societyId: 'society-1',
      guardUserId: 'guard-1',
    );

    await queue.enqueue(action);
    await queue.enqueue(action);

    final items = await queue.read();
    expect(items, hasLength(1));
    expect(items.single.idempotencyKey, 'idem-1');
    expect(items.single.belongsTo(societyId: 'society-1', guardUserId: 'guard-1'), isTrue);
  });

  test('keeps equal idempotency keys isolated across different guard sessions', () async {
    const queue = WorkforceOfflineQueue();
    final createdAt = DateTime.utc(2026, 9, 13, 12);

    await queue.enqueue(QueuedWorkforceAction(
      type: 'CHECK_IN',
      gateId: 'gate-1',
      assignmentId: 'assignment-1',
      idempotencyKey: 'shared-idem',
      createdAt: createdAt,
      societyId: 'society-1',
      guardUserId: 'guard-1',
    ));
    await queue.enqueue(QueuedWorkforceAction(
      type: 'CHECK_OUT',
      gateId: 'gate-2',
      assignmentId: 'assignment-2',
      idempotencyKey: 'shared-idem',
      createdAt: createdAt.add(const Duration(minutes: 1)),
      societyId: 'society-2',
      guardUserId: 'guard-2',
    ));

    final items = await queue.read();
    expect(items, hasLength(2));
    expect(items.where((item) => item.belongsTo(societyId: 'society-1', guardUserId: 'guard-1')), hasLength(1));
    expect(items.where((item) => item.belongsTo(societyId: 'society-2', guardUserId: 'guard-2')), hasLength(1));
  });

  test('sanitizes malformed secure-storage records and retains valid actions', () async {
    final valid = QueuedWorkforceAction(
      type: 'CHECK_OUT',
      gateId: 'gate-1',
      assignmentId: 'assignment-1',
      idempotencyKey: 'idem-valid',
      createdAt: DateTime.utc(2026, 9, 13, 12),
      societyId: 'society-1',
      guardUserId: 'guard-1',
    );
    FlutterSecureStorage.setMockInitialValues({
      'guard.workforceOfflineQueue': jsonEncode([
        valid.toJson(),
        {
          'type': 'INVALID',
          'gateId': 'gate-1',
          'assignmentId': 'assignment-bad',
          'idempotencyKey': 'idem-bad',
          'createdAt': 'not-a-date',
          'societyId': 'society-1',
          'guardUserId': 'guard-1',
        },
      ]),
    });

    const queue = WorkforceOfflineQueue();
    final firstRead = await queue.read();
    final secondRead = await queue.read();

    expect(firstRead, hasLength(1));
    expect(firstRead.single.idempotencyKey, 'idem-valid');
    expect(secondRead, hasLength(1));
    expect(secondRead.single.idempotencyKey, 'idem-valid');
  });
}
