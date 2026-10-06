import 'resident_repository.dart';

extension UtilityBillingRepositoryExtension on ResidentRepository {
  Future<List<Map<String, dynamic>>> issuedUtilityCharges() async {
    final value = await api.get('/api/v1/utilities/v2/resident/charges');
    if (value is! List) return const [];
    return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }
  Future<List<Map<String, dynamic>>> utilityUsageHistory({String? unitId}) async {
    final suffix = unitId == null || unitId.isEmpty ? '' : '?unitId=${Uri.encodeQueryComponent(unitId)}';
    final value = await api.get('/api/v1/utilities/v2/resident/usage$suffix');
    if (value is! List) return const [];
    return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

}
