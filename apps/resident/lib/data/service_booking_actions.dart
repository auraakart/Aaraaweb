import 'resident_repository.dart';

extension ServiceBookingActions on ResidentRepository {
  Future<Map<String, dynamic>> createServiceBooking({
    required String unitId,
    required String offeringId,
    required DateTime scheduledFrom,
    required DateTime scheduledUntil,
    String? notes,
  }) async {
    if (!scheduledUntil.isAfter(scheduledFrom)) {
      throw ArgumentError('Service end time must be after start time');
    }
    final value = await api.post('/api/v1/services-marketplace/bookings', {
      'unitId': unitId,
      'offeringId': offeringId,
      'scheduledFrom': scheduledFrom.toUtc().toIso8601String(),
      'scheduledUntil': scheduledUntil.toUtc().toIso8601String(),
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> cancelServiceBooking(String bookingId) async {
    final value = await api.post('/api/v1/services-marketplace/bookings/$bookingId/cancel');
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> rateServiceBooking(
    String bookingId, {
    required int score,
    String? comment,
  }) async {
    if (score < 1 || score > 5) throw ArgumentError('Rating must be between 1 and 5');
    final value = await api.post('/api/v1/services-marketplace/bookings/$bookingId/rating', {
      'score': score,
      if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
    });
    return Map<String, dynamic>.from(value as Map);
  }
}
