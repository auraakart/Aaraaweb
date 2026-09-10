import 'resident_repository.dart';

extension ResidentAmenityActions on ResidentRepository {
  Future<List<Map<String, dynamic>>> amenities() async {
    final value = await api.get('/api/v1/amenities');
    return _amenityList(value);
  }

  Future<List<Map<String, dynamic>>> amenityBookings(String unitId) async {
    final value = await api.get('/api/v1/amenities/bookings/mine?unitId=$unitId');
    return _amenityList(value);
  }

  Future<Map<String, dynamic>> createAmenityBooking({
    required String amenityId,
    required String unitId,
    required DateTime startsAt,
    required DateTime endsAt,
  }) async {
    final value = await api.post('/api/v1/amenities/$amenityId/bookings', {
      'unitId': unitId,
      'startsAt': startsAt.toUtc().toIso8601String(),
      'endsAt': endsAt.toUtc().toIso8601String(),
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> cancelAmenityBooking(String bookingId) async {
    final value = await api.patch('/api/v1/amenities/bookings/$bookingId/cancel');
    return Map<String, dynamic>.from(value as Map);
  }
}

List<Map<String, dynamic>> _amenityList(dynamic value) {
  if (value is! List) return const [];
  return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
}
