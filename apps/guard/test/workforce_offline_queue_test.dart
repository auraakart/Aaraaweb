import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/data/workforce_offline_queue.dart';

void main() {
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
}
