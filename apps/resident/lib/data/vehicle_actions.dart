import 'resident_repository.dart';

extension VehicleActions on ResidentRepository {
  Future<Map<String, dynamic>> addVehicle({
    required String householdId,
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
  }) async {
    final value = await api.post('/api/v1/households/$householdId/vehicles', _vehicleBody(
      plateNumber: plateNumber,
      vehicleType: vehicleType,
      make: make,
      model: model,
      color: color,
    ));
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> updateVehicle({
    required String householdId,
    required String vehicleId,
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
  }) async {
    final value = await api.patch('/api/v1/households/$householdId/vehicles/$vehicleId', _vehicleBody(
      plateNumber: plateNumber,
      vehicleType: vehicleType,
      make: make,
      model: model,
      color: color,
    ));
    return Map<String, dynamic>.from(value as Map);
  }

  Future<void> deactivateVehicle({required String householdId, required String vehicleId}) =>
      api.patch('/api/v1/households/$householdId/vehicles/$vehicleId/deactivate');
}

Map<String, dynamic> _vehicleBody({
  required String plateNumber,
  required String vehicleType,
  String? make,
  String? model,
  String? color,
}) => {
      'plateNumber': plateNumber.trim(),
      'vehicleType': vehicleType,
      if (make != null && make.trim().isNotEmpty) 'make': make.trim(),
      if (model != null && model.trim().isNotEmpty) 'model': model.trim(),
      if (color != null && color.trim().isNotEmpty) 'color': color.trim(),
    };
