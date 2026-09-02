import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class QueuedWorkforceAction {
  const QueuedWorkforceAction({
    required this.type,
    required this.gateId,
    required this.assignmentId,
    required this.idempotencyKey,
    required this.createdAt,
  });

  final String type;
  final String gateId;
  final String assignmentId;
  final String idempotencyKey;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
        'type': type,
        'gateId': gateId,
        'assignmentId': assignmentId,
        'idempotencyKey': idempotencyKey,
        'createdAt': createdAt.toIso8601String(),
      };

  factory QueuedWorkforceAction.fromJson(Map<String, dynamic> json) => QueuedWorkforceAction(
        type: json['type']?.toString() ?? '',
        gateId: json['gateId']?.toString() ?? '',
        assignmentId: json['assignmentId']?.toString() ?? '',
        idempotencyKey: json['idempotencyKey']?.toString() ?? '',
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );
}

class WorkforceOfflineQueue {
  const WorkforceOfflineQueue();
  static const _storage = FlutterSecureStorage();
  static const _key = 'guard.workforceOfflineQueue';

  Future<List<QueuedWorkforceAction>> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((item) => QueuedWorkforceAction.fromJson(Map<String, dynamic>.from(item)))
        .where((item) => item.idempotencyKey.isNotEmpty && item.assignmentId.isNotEmpty)
        .toList();
  }

  Future<void> enqueue(QueuedWorkforceAction action) async {
    final items = await read();
    if (items.any((item) => item.idempotencyKey == action.idempotencyKey)) return;
    await replace([...items, action]);
  }

  Future<void> replace(List<QueuedWorkforceAction> actions) => _storage.write(
        key: _key,
        value: jsonEncode(actions.map((item) => item.toJson()).toList()),
      );
}
