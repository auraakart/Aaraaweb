import 'resident_repository.dart';

extension VehicleActions on ResidentRepository {
  Future<Map<String, dynamic>> addVehicle({
    required String householdId,
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
    String? parkingSlot,
  }) async {
    final value = await api.post('/api/v1/households/$householdId/vehicles', {
      'plateNumber': plateNumber.trim(),
      'vehicleType': vehicleType,
      if (make != null && make.trim().isNotEmpty) 'make': make.trim(),
      if (model != null && model.trim().isNotEmpty) 'model': model.trim(),
      if (color != null && color.trim().isNotEmpty) 'color': color.trim(),
      if (parkingSlot != null && parkingSlot.trim().isNotEmpty) 'parkingSlot': parkingSlot.trim(),
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<void> updateVehicleParkingSlot({required String householdId, required String vehicleId, String? parkingSlot}) =>
      api.patch('/api/v1/households/$householdId/vehicles/$vehicleId/parking-slot', {
        'parkingSlot': parkingSlot?.trim() ?? '',
      });

  Future<void> deactivateVehicle({required String householdId, required String vehicleId}) =>
      api.patch('/api/v1/households/$householdId/vehicles/$vehicleId/deactivate');
}
