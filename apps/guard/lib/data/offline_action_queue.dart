import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class QueuedGateAction {
  const QueuedGateAction({
    required this.type,
    required this.gateId,
    required this.credential,
    required this.idempotencyKey,
    required this.createdAt,
    required this.societyId,
    required this.guardUserId,
    this.attemptCount = 0,
    this.lastAttemptAt,
    this.nextAttemptAt,
    this.failureKind,
    this.reviewRequired = false,
  });
  final String type;
  final String gateId;
  final String credential;
  final String idempotencyKey;
  final DateTime createdAt;
  final String societyId;
  final String guardUserId;
  final int attemptCount;
  final DateTime? lastAttemptAt;
  final DateTime? nextAttemptAt;
  final String? failureKind;
  final bool reviewRequired;

  bool belongsTo({required String societyId, required String guardUserId}) =>
      this.societyId == societyId && this.guardUserId == guardUserId;

  bool isStale(DateTime now, {Duration maxAge = const Duration(days: 30)}) =>
      !createdAt.isAfter(now) && now.difference(createdAt) > maxAge;

  bool canRetry(DateTime now) => !reviewRequired && (nextAttemptAt == null || !nextAttemptAt!.isAfter(now));

  QueuedGateAction withRetryFailure(DateTime now) {
    final attempts = attemptCount + 1;
    final exponent = attempts > 6 ? 6 : attempts;
    final seconds = 5 * (1 << (exponent - 1));
    return copyWith(
      attemptCount: attempts,
      lastAttemptAt: now,
      nextAttemptAt: now.add(Duration(seconds: seconds > 300 ? 300 : seconds)),
      failureKind: 'TRANSPORT',
      reviewRequired: false,
    );
  }

  QueuedGateAction requiringReview(DateTime now, String kind) => copyWith(
        attemptCount: attemptCount + 1,
        lastAttemptAt: now,
        clearNextAttemptAt: true,
        failureKind: kind,
        reviewRequired: true,
      );

  QueuedGateAction copyWith({
    int? attemptCount,
    DateTime? lastAttemptAt,
    DateTime? nextAttemptAt,
    bool clearNextAttemptAt = false,
    String? failureKind,
    bool? reviewRequired,
  }) => QueuedGateAction(
        type: type,
        gateId: gateId,
        credential: credential,
        idempotencyKey: idempotencyKey,
        createdAt: createdAt,
        societyId: societyId,
        guardUserId: guardUserId,
        attemptCount: attemptCount ?? this.attemptCount,
        lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,
        nextAttemptAt: clearNextAttemptAt ? null : (nextAttemptAt ?? this.nextAttemptAt),
        failureKind: failureKind ?? this.failureKind,
        reviewRequired: reviewRequired ?? this.reviewRequired,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'gateId': gateId,
        'credential': credential,
        'idempotencyKey': idempotencyKey,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'societyId': societyId,
        'guardUserId': guardUserId,
        'attemptCount': attemptCount,
        if (lastAttemptAt != null) 'lastAttemptAt': lastAttemptAt!.toUtc().toIso8601String(),
        if (nextAttemptAt != null) 'nextAttemptAt': nextAttemptAt!.toUtc().toIso8601String(),
        if (failureKind != null) 'failureKind': failureKind,
        'reviewRequired': reviewRequired,
      };

  static QueuedGateAction? tryFromJson(Map<String, dynamic> json) {
    final type = json['type']?.toString() ?? '';
    final gateId = json['gateId']?.toString() ?? '';
    final credential = json['credential']?.toString() ?? '';
    final idempotencyKey = json['idempotencyKey']?.toString() ?? '';
    final societyId = json['societyId']?.toString() ?? '';
    final guardUserId = json['guardUserId']?.toString() ?? '';
    final createdAt = DateTime.tryParse(json['createdAt']?.toString() ?? '');
    final attemptCount = int.tryParse(json['attemptCount']?.toString() ?? '0') ?? 0;
    final lastAttemptAt = DateTime.tryParse(json['lastAttemptAt']?.toString() ?? '');
    final nextAttemptAt = DateTime.tryParse(json['nextAttemptAt']?.toString() ?? '');
    final failureKind = json['failureKind']?.toString();
    final reviewRequired = json['reviewRequired'] == true;
    if (!const {'CHECK_IN', 'CHECK_OUT'}.contains(type) ||
        gateId.isEmpty || credential.isEmpty || idempotencyKey.isEmpty || societyId.isEmpty || guardUserId.isEmpty ||
        createdAt == null || attemptCount < 0) {
      return null;
    }
    return QueuedGateAction(
      type: type,
      gateId: gateId,
      credential: credential,
      idempotencyKey: idempotencyKey,
      createdAt: createdAt.toUtc(),
      societyId: societyId,
      guardUserId: guardUserId,
      attemptCount: attemptCount,
      lastAttemptAt: lastAttemptAt?.toUtc(),
      nextAttemptAt: nextAttemptAt?.toUtc(),
      failureKind: failureKind,
      reviewRequired: reviewRequired,
    );
  }
}

class OfflineActionQueue {
  const OfflineActionQueue();
  static const _storage = FlutterSecureStorage();
  static const _key = 'guard.offlineQueue';

  Future<List<QueuedGateAction>> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    dynamic decoded;
    try { decoded = jsonDecode(raw); } catch (_) { await clear(); return const []; }
    if (decoded is! List) { await clear(); return const []; }
    final actions = <QueuedGateAction>[];
    for (final item in decoded.whereType<Map>()) {
      final action = QueuedGateAction.tryFromJson(Map<String, dynamic>.from(item));
      if (action != null) actions.add(action);
    }
    if (actions.length != decoded.length) await replace(actions);
    return actions;
  }

  Future<void> enqueue(QueuedGateAction action) async {
    final items = await read();
    if (items.any((item) => item.belongsTo(societyId: action.societyId, guardUserId: action.guardUserId) && item.idempotencyKey == action.idempotencyKey)) return;
    await replace([...items, action]);
  }

  Future<void> replace(List<QueuedGateAction> actions) async =>
      _storage.write(key: _key, value: jsonEncode(actions.map((item) => item.toJson()).toList()));

  Future<void> clear() => _storage.delete(key: _key);
}
