import 'resident_repository.dart';

extension HouseholdProfileActions on ResidentRepository {
  Future<List<Map<String, dynamic>>> householdChangeRequests() async {
    final value = await api.get('/api/v1/households/change-requests/mine');
    if (value is! List) return const [];
    return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

  Future<Map<String, dynamic>> addEmergencyContact({
    required String householdId,
    required String name,
    required String phone,
    String? relation,
    int priority = 1,
  }) async {
    final value = await api.post('/api/v1/households/$householdId/emergency-contacts', {
      'name': name.trim(),
      'phone': phone.trim(),
      if (relation != null && relation.trim().isNotEmpty) 'relation': relation.trim(),
      'priority': priority,
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<void> deactivateEmergencyContact({required String householdId, required String contactId}) =>
      api.patch('/api/v1/households/$householdId/emergency-contacts/$contactId/deactivate');
}
