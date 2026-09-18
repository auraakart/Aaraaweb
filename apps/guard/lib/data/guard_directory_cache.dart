import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class GuardDirectorySnapshot {
  const GuardDirectorySnapshot({
    required this.societyId,
    required this.guardUserId,
    required this.savedAt,
    required this.gates,
    required this.units,
  });

  final String societyId;
  final String guardUserId;
  final DateTime savedAt;
  final List<Map<String, dynamic>> gates;
  final List<Map<String, dynamic>> units;

  bool belongsTo({required String societyId, required String guardUserId}) =>
      this.societyId == societyId && this.guardUserId == guardUserId;

  bool isFresh(DateTime now, {Duration maxAge = const Duration(hours: 24)}) =>
      !savedAt.isAfter(now) && now.difference(savedAt) <= maxAge;

  Map<String, dynamic> toJson() => {
        'societyId': societyId,
        'guardUserId': guardUserId,
        'savedAt': savedAt.toUtc().toIso8601String(),
        'gates': gates,
        'units': units,
      };

  static GuardDirectorySnapshot? tryFromJson(Map<String, dynamic> json) {
    final societyId = json['societyId']?.toString() ?? '';
    final guardUserId = json['guardUserId']?.toString() ?? '';
    final savedAt = DateTime.tryParse(json['savedAt']?.toString() ?? '');
    final gates = _maps(json['gates']);
    final units = _maps(json['units']);
    if (societyId.isEmpty || guardUserId.isEmpty || savedAt == null) return null;
    return GuardDirectorySnapshot(
      societyId: societyId,
      guardUserId: guardUserId,
      savedAt: savedAt.toUtc(),
      gates: gates,
      units: units,
    );
  }

  static List<Map<String, dynamic>> _maps(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }
}

class GuardDirectoryCache {
  const GuardDirectoryCache();
  static const _storage = FlutterSecureStorage();
  static const _prefix = 'guard.directory';

  String _key(String societyId, String guardUserId) => '$_prefix.$societyId.$guardUserId';

  Future<GuardDirectorySnapshot?> read({required String societyId, required String guardUserId}) async {
    final raw = await _storage.read(key: _key(societyId, guardUserId));
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final snapshot = GuardDirectorySnapshot.tryFromJson(Map<String, dynamic>.from(decoded));
      if (snapshot == null || !snapshot.belongsTo(societyId: societyId, guardUserId: guardUserId)) return null;
      return snapshot;
    } catch (_) {
      return null;
    }
  }

  Future<void> save(GuardDirectorySnapshot snapshot) => _storage.write(
        key: _key(snapshot.societyId, snapshot.guardUserId),
        value: jsonEncode(snapshot.toJson()),
      );

  Future<void> clear({required String societyId, required String guardUserId}) =>
      _storage.delete(key: _key(societyId, guardUserId));
}
