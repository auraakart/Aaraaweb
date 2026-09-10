class DemoHouseholdProfileStore {
  DemoHouseholdProfileStore._();

  static final Map<String, List<Map<String, dynamic>>> _familyByHousehold = {
    'demo-household-1': [
      {
        'id': 'demo-family-1',
        'relation': 'FAMILY_MEMBER',
        'primaryGateContact': false,
        'gateApprovalEnabled': true,
        'gateNotificationEnabled': true,
        'user': {'name': 'Priya Sharma', 'phone': '+91 98765 41001', 'status': 'ACTIVE'},
      },
      {
        'id': 'demo-family-2',
        'relation': 'FAMILY_MEMBER',
        'primaryGateContact': false,
        'gateApprovalEnabled': false,
        'gateNotificationEnabled': true,
        'user': {'name': 'Arjun Sharma', 'phone': '+91 98765 41002', 'status': 'ACTIVE'},
      },
      {
        'id': 'demo-family-3',
        'relation': 'FAMILY_MEMBER',
        'primaryGateContact': false,
        'gateApprovalEnabled': false,
        'gateNotificationEnabled': false,
        'user': {'name': 'Meera Sharma', 'phone': '+91 98765 41003', 'status': 'ACTIVE'},
      },
    ],
    'demo-household-2': [
      {
        'id': 'demo-family-4',
        'relation': 'FAMILY_MEMBER',
        'primaryGateContact': false,
        'gateApprovalEnabled': false,
        'gateNotificationEnabled': true,
        'user': {'name': 'Ananya Nair', 'phone': '+91 98765 42001', 'status': 'ACTIVE'},
      },
    ],
  };

  static final Map<String, List<Map<String, dynamic>>> _vehiclesByHousehold = {
    'demo-household-1': [
      {'id': 'demo-vehicle-1', 'plateNumber': 'KA01AB1234', 'vehicleType': 'CAR', 'make': 'Maruti Suzuki', 'model': 'Baleno', 'color': 'White', 'active': true},
    ],
    'demo-household-2': [
      {'id': 'demo-vehicle-2', 'plateNumber': 'KA05MK8842', 'vehicleType': 'TWO_WHEELER', 'make': 'Honda', 'model': 'Activa', 'color': 'Grey', 'active': true},
    ],
  };

  static final Map<String, List<Map<String, dynamic>>> _contactsByHousehold = {
    'demo-household-1': [
      {'id': 'demo-contact-1', 'name': 'Suresh Sharma', 'phone': '+91 98765 43001', 'relation': 'Brother', 'priority': 1, 'active': true},
    ],
    'demo-household-2': const [],
  };

  static final Map<String, List<Map<String, dynamic>>> _pendingByHousehold = {};

  static List<Map<String, dynamic>> familyMembers(String householdId) =>
      _familyByHousehold.putIfAbsent(householdId, () => []);

  static List<Map<String, dynamic>> vehicles(String householdId) =>
      _vehiclesByHousehold.putIfAbsent(householdId, () => []);

  static List<Map<String, dynamic>> emergencyContacts(String householdId) =>
      _contactsByHousehold.putIfAbsent(householdId, () => []);

  static List<Map<String, dynamic>> pendingRequests(String householdId) =>
      _pendingByHousehold.putIfAbsent(householdId, () => []);

  static Map<String, dynamic> requestFamilyAdd({
    required String householdId,
    required String name,
    required String phone,
    required bool gateApprovalEnabled,
    required bool gateNotificationEnabled,
    required bool primaryGateContact,
  }) {
    final request = _pending(
      householdId: householdId,
      type: 'FAMILY_MEMBER_ADD',
      payload: {
        'name': name.trim(),
        'phone': phone.trim(),
        'gateApprovalEnabled': gateApprovalEnabled,
        'gateNotificationEnabled': gateNotificationEnabled,
        'primaryGateContact': primaryGateContact,
      },
    );
    pendingRequests(householdId).add(request);
    return request;
  }

  static Map<String, dynamic> requestFamilyRemove({required String householdId, required Map<String, dynamic> member}) {
    final request = _pending(
      householdId: householdId,
      type: 'FAMILY_MEMBER_REMOVE',
      targetId: member['id']?.toString(),
      payload: {
        'name': member['user'] is Map ? (member['user'] as Map)['name']?.toString() ?? 'Family member' : 'Family member',
      },
    );
    pendingRequests(householdId).add(request);
    return request;
  }

  static Map<String, dynamic> requestVehicleAdd({
    required String householdId,
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
  }) {
    final request = _pending(
      householdId: householdId,
      type: 'VEHICLE_ADD',
      payload: _vehiclePayload(plateNumber: plateNumber, vehicleType: vehicleType, make: make, model: model, color: color),
    );
    pendingRequests(householdId).add(request);
    return request;
  }

  static Map<String, dynamic> requestVehicleUpdate({
    required String householdId,
    required String vehicleId,
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
  }) {
    if (hasPending(householdId, 'VEHICLE_UPDATE', targetId: vehicleId)) {
      throw StateError('A vehicle edit request is already pending society approval');
    }
    final request = _pending(
      householdId: householdId,
      type: 'VEHICLE_UPDATE',
      targetId: vehicleId,
      payload: _vehiclePayload(plateNumber: plateNumber, vehicleType: vehicleType, make: make, model: model, color: color),
    );
    pendingRequests(householdId).add(request);
    return request;
  }

  static Map<String, dynamic> requestVehicleRemove({required String householdId, required Map<String, dynamic> vehicle}) {
    final request = _pending(
      householdId: householdId,
      type: 'VEHICLE_REMOVE',
      targetId: vehicle['id']?.toString(),
      payload: {'plateNumber': vehicle['plateNumber']?.toString() ?? 'Vehicle'},
    );
    pendingRequests(householdId).add(request);
    return request;
  }

  static Map<String, dynamic> addEmergencyContact({
    required String householdId,
    required String name,
    required String phone,
    String? relation,
    int priority = 1,
  }) {
    final contact = {
      'id': 'demo-contact-${DateTime.now().microsecondsSinceEpoch}',
      'name': name.trim(),
      'phone': phone.trim(),
      if (relation?.trim().isNotEmpty == true) 'relation': relation!.trim(),
      'priority': priority,
      'active': true,
    };
    emergencyContacts(householdId).add(contact);
    return contact;
  }

  static void removeEmergencyContact(String householdId, String contactId) {
    emergencyContacts(householdId).removeWhere((item) => item['id']?.toString() == contactId);
  }

  static bool hasPending(String householdId, String type, {String? targetId}) =>
      pendingRequests(householdId).any((item) =>
          item['status'] == 'PENDING' && item['type'] == type && (targetId == null || item['targetId']?.toString() == targetId));

  static Map<String, dynamic> _vehiclePayload({
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
  }) => {
        'plateNumber': plateNumber.trim().toUpperCase().replaceAll(RegExp(r'[\s-]+'), ''),
        'vehicleType': vehicleType,
        if (make?.trim().isNotEmpty == true) 'make': make!.trim(),
        if (model?.trim().isNotEmpty == true) 'model': model!.trim(),
        if (color?.trim().isNotEmpty == true) 'color': color!.trim(),
      };

  static Map<String, dynamic> _pending({
    required String householdId,
    required String type,
    String? targetId,
    required Map<String, dynamic> payload,
  }) => {
        'id': 'demo-request-${DateTime.now().microsecondsSinceEpoch}',
        'householdId': householdId,
        'type': type,
        'status': 'PENDING',
        'requestedByUserId': 'demo-resident',
        if (targetId != null) 'targetId': targetId,
        'payload': payload,
        'createdAt': DateTime.now().toUtc().toIso8601String(),
      };
}
