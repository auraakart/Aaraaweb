import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class QueuedGateAction {
  const QueuedGateAction({required this.type, required this.gateId, required this.credential, required this.createdAt});
  final String type;
  final String gateId;
  final String credential;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
        'type': type,
        'gateId': gateId,
        'credential': credential,
        'createdAt': createdAt.toIso8601String(),
      };

  factory QueuedGateAction.fromJson(Map<String, dynamic> json) => QueuedGateAction(
        type: json['type']?.toString() ?? '',
        gateId: json['gateId']?.toString() ?? '',
        credential: json['credential']?.toString() ?? '',
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );
}

class OfflineActionQueue {
  const OfflineActionQueue();
  static const _storage = FlutterSecureStorage();
  static const _key = 'guard.offlineQueue';

  Future<List<QueuedGateAction>> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded.whereType<Map>().map((item) => QueuedGateAction.fromJson(Map<String, dynamic>.from(item))).toList();
  }

  Future<void> enqueue(QueuedGateAction action) async {
    final items = await read();
    final updated = [...items, action];
    await _storage.write(key: _key, value: jsonEncode(updated.map((item) => item.toJson()).toList()));
  }

  Future<void> replace(List<QueuedGateAction> actions) async {
    await _storage.write(key: _key, value: jsonEncode(actions.map((item) => item.toJson()).toList()));
  }

  Future<void> clear() => _storage.delete(key: _key);
}
