import 'models/resident_sos_incident.dart';
import 'resident_repository.dart';

extension SosRepositoryExtension on ResidentRepository {
  Future<List<ResidentSosIncident>> sosIncidents() async {
    final value = await api.get('/api/v1/sos/mine');
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => ResidentSosIncident.fromJson(Map<String, dynamic>.from(item)))
        .toList(growable: false);
  }

  Future<ResidentSosIncident> triggerSos({required String unitId, String? message}) async {
    final value = await api.post('/api/v1/sos', {
      'unitId': unitId,
      if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
    });
    return ResidentSosIncident.fromJson(Map<String, dynamic>.from(value as Map));
  }

  Future<ResidentSosIncident> cancelSos(String incidentId, {String? note}) async {
    final value = await api.patch('/api/v1/sos/$incidentId/cancel', {
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
    });
    return ResidentSosIncident.fromJson(Map<String, dynamic>.from(value as Map));
  }
}
