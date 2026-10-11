import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class QueuedWorkforceAction {
  const QueuedWorkforceAction({
    required this.type,
    required this.gateId,
    required this.assignmentId,
    required this.idempotencyKey,
    required this.createdAt,
    required this.societyId,
    required this.guardUserId,
    this.attemptCount = 0,
    this.nextAttemptAt,
    this.failureKind,
    this.reviewRequired = false,
  });

  final String type;
  final String gateId;
  final String assignmentId;
  final String idempotencyKey;
  final DateTime createdAt;
  final String societyId;
  final String guardUserId;
  final int attemptCount;
  final DateTime? nextAttemptAt;
  final String? failureKind;
  final bool reviewRequired;

  bool belongsTo({required String societyId, required String guardUserId}) =>
      this.societyId == societyId && this.guardUserId == guardUserId;

  // Old attendance must be reconciled by a supervisor, never blindly replayed.
  bool isStale(DateTime now) =>
      now.toUtc().difference(createdAt.toUtc()) > const Duration(hours: 24);

  bool canRetry(DateTime now) =>
      !reviewRequired && (nextAttemptAt == null || !nextAttemptAt!.isAfter(now));

  QueuedWorkforceAction withRetryFailure(DateTime now) {
    final attempts = attemptCount + 1;
    if (attempts >= 6) return requiringReview(now, 'RETRY_LIMIT');
    final backoffSeconds = 5 * (1 << (attempts - 1));
    return _copy(
      attemptCount: attempts,
      nextAttemptAt: now.add(Duration(seconds: backoffSeconds)),
      failureKind: 'TRANSPORT',
    );
  }

  QueuedWorkforceAction requiringReview(DateTime now, String reason) => _copy(
        attemptCount: attemptCount + 1,
        clearNextAttemptAt: true,
        failureKind: reason,
        reviewRequired: true,
      );

  QueuedWorkforceAction _copy({
    int? attemptCount,
    DateTime? nextAttemptAt,
    bool clearNextAttemptAt = false,
    String? failureKind,
    bool? reviewRequired,
  }) => QueuedWorkforceAction(
        type: type,
        gateId: gateId,
        assignmentId: assignmentId,
        idempotencyKey: idempotencyKey,
        createdAt: createdAt,
        societyId: societyId,
        guardUserId: guardUserId,
        attemptCount: attemptCount ?? this.attemptCount,
        nextAttemptAt: clearNextAttemptAt ? null : (nextAttemptAt ?? this.nextAttemptAt),
        failureKind: failureKind ?? this.failureKind,
        reviewRequired: reviewRequired ?? this.reviewRequired,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'gateId': gateId,
        'assignmentId': assignmentId,
        'idempotencyKey': idempotencyKey,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'societyId': societyId,
        'guardUserId': guardUserId,
        'attemptCount': attemptCount,
        if (nextAttemptAt != null) 'nextAttemptAt': nextAttemptAt!.toUtc().toIso8601String(),
        if (failureKind != null) 'failureKind': failureKind,
        'reviewRequired': reviewRequired,
      };

  static QueuedWorkforceAction? tryFromJson(Map<String, dynamic> json) {
    final type = json['type']?.toString() ?? '';
    final gateId = json['gateId']?.toString() ?? '';
    final assignmentId = json['assignmentId']?.toString() ?? '';
    final idempotencyKey = json['idempotencyKey']?.toString() ?? '';
    final societyId = json['societyId']?.toString() ?? '';
    final guardUserId = json['guardUserId']?.toString() ?? '';
    final createdAt = DateTime.tryParse(json['createdAt']?.toString() ?? '');
    final attemptCount = int.tryParse(json['attemptCount']?.toString() ?? '0') ?? -1;
    final nextAttemptAt = DateTime.tryParse(json['nextAttemptAt']?.toString() ?? '');
    final failureKind = json['failureKind']?.toString();
    final reviewRequired = json['reviewRequired'] == true;
    if (!const {'CHECK_IN', 'CHECK_OUT'}.contains(type) ||
        gateId.isEmpty ||
        assignmentId.isEmpty ||
        idempotencyKey.isEmpty ||
        societyId.isEmpty ||
        guardUserId.isEmpty ||
        createdAt == null || attemptCount < 0) {
      return null;
    }
    return QueuedWorkforceAction(
      type: type,
      gateId: gateId,
      assignmentId: assignmentId,
      idempotencyKey: idempotencyKey,
      createdAt: createdAt.toUtc(),
      societyId: societyId,
      guardUserId: guardUserId,
      attemptCount: attemptCount,
      nextAttemptAt: nextAttemptAt?.toUtc(),
      failureKind: failureKind,
      reviewRequired: reviewRequired,
    );
  }
}

class WorkforceOfflineQueue {
  const WorkforceOfflineQueue();
  static const _storage = FlutterSecureStorage();
  static const _key = 'guard.workforceOfflineQueue';

  Future<List<QueuedWorkforceAction>> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      await clear();
      return const [];
    }
    if (decoded is! List) {
      await clear();
      return const [];
    }
    final actions = <QueuedWorkforceAction>[];
    for (final item in decoded.whereType<Map>()) {
      final action = QueuedWorkforceAction.tryFromJson(Map<String, dynamic>.from(item));
      if (action != null) actions.add(action);
    }
    if (actions.length != decoded.length) await replace(actions);
    return actions;
  }

  Future<void> enqueue(QueuedWorkforceAction action) async {
    final items = await read();
    if (items.any((item) =>
        item.belongsTo(societyId: action.societyId, guardUserId: action.guardUserId) &&
        item.idempotencyKey == action.idempotencyKey)) {
      return;
    }
    await replace([...items, action]);
  }

  Future<void> replace(List<QueuedWorkforceAction> actions) => _storage.write(
        key: _key,
        value: jsonEncode(actions.map((item) => item.toJson()).toList()),
      );

  Future<void> clear() => _storage.delete(key: _key);
}
