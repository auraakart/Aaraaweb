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
  });
  final String type;
  final String gateId;
  final String credential;
  final String idempotencyKey;
  final DateTime createdAt;
  final String societyId;
  final String guardUserId;

  bool belongsTo({required String societyId, required String guardUserId}) =>
      this.societyId == societyId && this.guardUserId == guardUserId;

  Map<String, dynamic> toJson() => {
        'type': type,
        'gateId': gateId,
        'credential': credential,
        'idempotencyKey': idempotencyKey,
        'createdAt': createdAt.toIso8601String(),
        'societyId': societyId,
        'guardUserId': guardUserId,
      };

  static QueuedGateAction? tryFromJson(Map<String, dynamic> json) {
    final type = json['type']?.toString() ?? '';
    final gateId = json['gateId']?.toString() ?? '';
    final credential = json['credential']?.toString() ?? '';
    final idempotencyKey = json['idempotencyKey']?.toString() ?? '';
    final societyId = json['societyId']?.toString() ?? '';
    final guardUserId = json['guardUserId']?.toString() ?? '';
    final createdAt = DateTime.tryParse(json['createdAt']?.toString() ?? '');
    if (!const {'CHECK_IN', 'CHECK_OUT'}.contains(type) ||
        gateId.isEmpty ||
        credential.isEmpty ||
        idempotencyKey.isEmpty ||
        societyId.isEmpty ||
        guardUserId.isEmpty ||
        createdAt == null) {
      return null;
    }
    return QueuedGateAction(
      type: type,
      gateId: gateId,
      credential: credential,
      idempotencyKey: idempotencyKey,
      createdAt: createdAt,
      societyId: societyId,
      guardUserId: guardUserId,
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
    if (items.any((item) =>
        item.belongsTo(societyId: action.societyId, guardUserId: action.guardUserId) &&
        item.idempotencyKey == action.idempotencyKey)) {
      return;
    }
    final updated = [...items, action];
    await _storage.write(key: _key, value: jsonEncode(updated.map((item) => item.toJson()).toList()));
  }

  Future<void> replace(List<QueuedGateAction> actions) async {
    await _storage.write(key: _key, value: jsonEncode(actions.map((item) => item.toJson()).toList()));
  }

  Future<void> clear() => _storage.delete(key: _key);
}
