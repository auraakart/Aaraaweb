import 'models/resident_parcel.dart';
import 'resident_repository.dart';

extension ResidentParcelActions on ResidentRepository {
  Future<List<ResidentParcel>> parcels() async {
    final value = await api.get('/api/v1/parcels/mine');
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => ResidentParcel.fromJson(Map<String, dynamic>.from(item)))
        .toList(growable: false);
  }

  Future<ParcelPickupCode> issueParcelPickupCode(String parcelId) async {
    final value = await api.post('/api/v1/parcels/mine/$parcelId/pickup-code', const {});
    return ParcelPickupCode.fromJson(Map<String, dynamic>.from(value as Map));
  }

  Future<void> confirmParcelCollection(String parcelId) async {
    await api.patch('/api/v1/parcels/mine/$parcelId/collect');
  }
}
