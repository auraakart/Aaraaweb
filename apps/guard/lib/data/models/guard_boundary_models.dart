String _requiredString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String && value.trim().isNotEmpty) return value;
  throw FormatException('Missing or invalid $key');
}

class GuardGate {
  GuardGate._(this.raw, this.id, this.name);
  final Map<String, dynamic> raw;
  final String id;
  final String name;

  factory GuardGate.fromJson(Map<String, dynamic> json) => GuardGate._(
        Map<String, dynamic>.from(json),
        _requiredString(json, 'id'),
        _requiredString(json, 'name'),
      );

  Map<String, dynamic> toJson() => {...raw, 'id': id, 'name': name};
}

class GuardUnit {
  GuardUnit._(this.raw, this.id);
  final Map<String, dynamic> raw;
  final String id;

  factory GuardUnit.fromJson(Map<String, dynamic> json) => GuardUnit._(
        Map<String, dynamic>.from(json),
        _requiredString(json, 'id'),
      );

  Map<String, dynamic> toJson() => {...raw, 'id': id};
}

class GuardParcel {
  GuardParcel({
    required this.id,
    required this.unitNumber,
    required this.recipientName,
    required this.overdue,
    this.courierName,
    this.trackingReference,
  });

  final String id;
  final String unitNumber;
  final String recipientName;
  final bool overdue;
  final String? courierName;
  final String? trackingReference;

  factory GuardParcel.fromJson(Map<String, dynamic> json) => GuardParcel(
        id: _requiredString(json, 'id'),
        unitNumber: (json['unitNumber'] ?? 'Unit').toString(),
        recipientName: (json['recipientName'] ?? 'Resident').toString(),
        overdue: json['overdue'] == true,
        courierName: json['courierName']?.toString(),
        trackingReference: json['trackingReference']?.toString(),
      );
}

class GuardParcelRecipient {
  GuardParcelRecipient({
    required this.unitId,
    required this.userId,
    required this.unitNumber,
    required this.name,
    required this.buildingLabel,
  });

  final String unitId;
  final String userId;
  final String unitNumber;
  final String name;
  final String buildingLabel;

  String get selectionKey => '$unitId:$userId';

  factory GuardParcelRecipient.fromJson(Map<String, dynamic> json) => GuardParcelRecipient(
        unitId: _requiredString(json, 'unitId'),
        userId: _requiredString(json, 'userId'),
        unitNumber: _requiredString(json, 'unitNumber'),
        name: _requiredString(json, 'name'),
        buildingLabel: (json['buildingName'] ?? json['buildingCode'] ?? 'Building').toString(),
      );
}


class GuardSocietyWorker {
  GuardSocietyWorker({
    required this.id,
    required this.name,
    required this.role,
    required this.department,
    required this.present,
    this.employer,
    this.eligible = true,
    this.reason,
  });

  final String id;
  final String name;
  final String role;
  final String department;
  final bool present;
  final String? employer;
  final bool eligible;
  final String? reason;

  factory GuardSocietyWorker.fromJson(Map<String, dynamic> json) => GuardSocietyWorker(
        id: _requiredString(json, 'id'),
        name: _requiredString(json, 'name'),
        role: _requiredString(json, 'role'),
        department: _requiredString(json, 'department'),
        present: json['present'] == true,
        employer: json['employer']?.toString(),
        eligible: json['eligible'] != false,
        reason: json['reason']?.toString(),
      );
}

class GuardWorkforceAssignment {
  GuardWorkforceAssignment({
    required this.id,
    required this.workerName,
    required this.workerRole,
    required this.unitNumber,
    required this.buildingName,
  });

  final String id;
  final String workerName;
  final String workerRole;
  final String unitNumber;
  final String buildingName;

  factory GuardWorkforceAssignment.fromJson(Map<String, dynamic> json) {
    final worker = json['worker'];
    final household = json['household'];
    if (worker is! Map || household is! Map) {
      throw const FormatException('Missing workforce relationship data');
    }
    final unit = household['unit'];
    if (unit is! Map) throw const FormatException('Missing workforce unit data');
    final building = unit['building'];
    if (building is! Map) throw const FormatException('Missing workforce building data');

    final workerMap = Map<String, dynamic>.from(worker);
    final unitMap = Map<String, dynamic>.from(unit);
    final buildingMap = Map<String, dynamic>.from(building);

    return GuardWorkforceAssignment(
      id: _requiredString(json, 'id'),
      workerName: _requiredString(workerMap, 'name'),
      workerRole: _requiredString(workerMap, 'role'),
      unitNumber: _requiredString(unitMap, 'number'),
      buildingName: (buildingMap['name'] ?? buildingMap['code'])?.toString().trim().isNotEmpty == true
          ? (buildingMap['name'] ?? buildingMap['code']).toString()
          : 'Building',
    );
  }
}
