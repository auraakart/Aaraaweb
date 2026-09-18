import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class GuardRecentArrival {
  const GuardRecentArrival({
    required this.societyId,
    required this.guardUserId,
    required this.unitId,
    required this.subjectType,
    required this.name,
    required this.lastUsedAt,
    this.provider,
    this.phone,
    this.vehicleNumber,
  });

  final String societyId;
  final String guardUserId;
  final String unitId;
  final String subjectType;
  final String name;
  final String? provider;
  final String? phone;
  final String? vehicleNumber;
  final DateTime lastUsedAt;

  bool belongsTo({required String societyId, required String guardUserId}) =>
      this.societyId == societyId && this.guardUserId == guardUserId;

  String get identityKey => '$unitId|$subjectType|${provider ?? ''}|$name';

  Map<String, dynamic> toJson() => {
        'societyId': societyId,
        'guardUserId': guardUserId,
        'unitId': unitId,
        'subjectType': subjectType,
        'name': name,
        if (provider != null) 'provider': provider,
        if (phone != null) 'phone': phone,
        if (vehicleNumber != null) 'vehicleNumber': vehicleNumber,
        'lastUsedAt': lastUsedAt.toIso8601String(),
      };

  static GuardRecentArrival? tryFromJson(Map<String, dynamic> json) {
    final societyId = json['societyId']?.toString() ?? '';
    final guardUserId = json['guardUserId']?.toString() ?? '';
    final unitId = json['unitId']?.toString() ?? '';
    final subjectType = json['subjectType']?.toString() ?? '';
    final name = json['name']?.toString() ?? '';
    final lastUsedAt = DateTime.tryParse(json['lastUsedAt']?.toString() ?? '');
    if (societyId.isEmpty ||
        guardUserId.isEmpty ||
        unitId.isEmpty ||
        !const {'DELIVERY', 'CAB'}.contains(subjectType) ||
        name.isEmpty ||
        lastUsedAt == null) {
      return null;
    }
    return GuardRecentArrival(
      societyId: societyId,
      guardUserId: guardUserId,
      unitId: unitId,
      subjectType: subjectType,
      name: name,
      provider: _optional(json['provider']),
      phone: _optional(json['phone']),
      vehicleNumber: _optional(json['vehicleNumber']),
      lastUsedAt: lastUsedAt.toUtc(),
    );
  }

  static String? _optional(dynamic value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? null : text;
  }
}

class GuardRecentArrivalStore {
  const GuardRecentArrivalStore();

  static const _storage = FlutterSecureStorage();
  static const _key = 'guard.recentArrivals.v1';
  static const maxStored = 24;
  static const maxPerGuard = 6;

  Future<List<GuardRecentArrival>> readFor({required String societyId, required String guardUserId}) async {
    final all = await _readAll();
    return all
        .where((item) => item.belongsTo(societyId: societyId, guardUserId: guardUserId))
        .toList(growable: false);
  }

  Future<void> remember(GuardRecentArrival arrival) async {
    final all = await _readAll();
    final scoped = all
        .where((item) => item.belongsTo(societyId: arrival.societyId, guardUserId: arrival.guardUserId))
        .where((item) => item.identityKey != arrival.identityKey)
        .toList(growable: true)
      ..insert(0, arrival);
    final trimmedScoped = scoped.take(maxPerGuard).toList(growable: false);
    final foreign = all
        .where((item) => !item.belongsTo(societyId: arrival.societyId, guardUserId: arrival.guardUserId))
        .toList(growable: false);
    final merged = [...trimmedScoped, ...foreign]
      ..sort((a, b) => b.lastUsedAt.compareTo(a.lastUsedAt));
    await _storage.write(
      key: _key,
      value: jsonEncode(merged.take(maxStored).map((item) => item.toJson()).toList()),
    );
  }

  Future<List<GuardRecentArrival>> _readAll() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      await _storage.delete(key: _key);
      return const [];
    }
    if (decoded is! List) {
      await _storage.delete(key: _key);
      return const [];
    }
    final items = <GuardRecentArrival>[];
    for (final item in decoded.whereType<Map>()) {
      final parsed = GuardRecentArrival.tryFromJson(Map<String, dynamic>.from(item));
      if (parsed != null) items.add(parsed);
    }
    items.sort((a, b) => b.lastUsedAt.compareTo(a.lastUsedAt));
    return items;
  }
}
