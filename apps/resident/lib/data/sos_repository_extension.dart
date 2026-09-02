import 'resident_repository.dart';

extension SosRepositoryExtension on ResidentRepository {
  Future<List<Map<String, dynamic>>> sosIncidents() async {
    final value = await api.get('/api/v1/sos/mine');
    if (value is! List) return const [];
    return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false);
  }

  Future<Map<String, dynamic>> triggerSos({required String unitId, String? message}) async {
    final value = await api.post('/api/v1/sos', {
      'unitId': unitId,
      if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> cancelSos(String incidentId, {String? note}) async {
    final value = await api.patch('/api/v1/sos/$incidentId/cancel', {
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
    });
    return Map<String, dynamic>.from(value as Map);
  }
}
