class DemoHouseholdState {
  DemoHouseholdState._();

  static final Map<String, List<Map<String, dynamic>>> familyMembers = {
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
    'demo-household-2': [],
  };

  static final Map<String, List<Map<String, dynamic>>> vehicles = {
    'demo-household-1': [
      {
        'id': 'demo-vehicle-1',
        'plateNumber': 'KA01AB1234',
        'vehicleType': 'CAR',
        'make': 'Maruti Suzuki',
        'model': 'Baleno',
        'color': 'Blue',
      },
    ],
    'demo-household-2': [],
  };

  static final Map<String, List<Map<String, dynamic>>> emergencyContacts = {
    'demo-household-1': [
      {
        'id': 'demo-contact-1',
        'name': 'Ravi Sharma',
        'phone': '+91 98765 42001',
        'relation': 'Brother',
        'priority': 1,
      },
    ],
    'demo-household-2': [],
  };

  static List<Map<String, dynamic>> familyFor(String householdId) =>
      familyMembers.putIfAbsent(householdId, () => <Map<String, dynamic>>[]);
  static List<Map<String, dynamic>> vehiclesFor(String householdId) =>
      vehicles.putIfAbsent(householdId, () => <Map<String, dynamic>>[]);
  static List<Map<String, dynamic>> contactsFor(String householdId) =>
      emergencyContacts.putIfAbsent(householdId, () => <Map<String, dynamic>>[]);
}
