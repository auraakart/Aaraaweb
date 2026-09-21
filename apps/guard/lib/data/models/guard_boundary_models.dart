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
  GuardParcel._(this.raw, this.id);
  final Map<String, dynamic> raw;
  final String id;

  factory GuardParcel.fromJson(Map<String, dynamic> json) => GuardParcel._(
        Map<String, dynamic>.from(json),
        _requiredString(json, 'id'),
      );

  Map<String, dynamic> toJson() => {...raw, 'id': id};
}
