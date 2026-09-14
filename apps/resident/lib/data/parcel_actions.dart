import 'resident_repository.dart';

extension ResidentParcelActions on ResidentRepository {
  Future<List<Map<String, dynamic>>> parcels() async {
    final value = await api.get('/api/v1/parcels/mine');
    if (value is! List) return const [];
    return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

  Future<Map<String, dynamic>> issueParcelPickupCode(String parcelId) async {
    final value = await api.post('/api/v1/parcels/mine/$parcelId/pickup-code', const {});
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> confirmParcelCollection(String parcelId) async {
    final value = await api.patch('/api/v1/parcels/mine/$parcelId/collect');
    return Map<String, dynamic>.from(value as Map);
  }
}
