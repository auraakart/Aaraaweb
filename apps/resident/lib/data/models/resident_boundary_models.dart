String _requiredString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String && value.trim().isNotEmpty) return value;
  throw FormatException('Missing or invalid $key');
}

int _requiredInt(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is int) return value;
  if (value is num) return value.toInt();
  throw FormatException('Missing or invalid $key');
}

class ResidentAccessRequest {
  ResidentAccessRequest._(this.raw, this.id, this.status, this.subjectType);
  final Map<String, dynamic> raw;
  final String id;
  final String status;
  final String subjectType;

  factory ResidentAccessRequest.fromJson(Map<String, dynamic> json) => ResidentAccessRequest._(
        Map<String, dynamic>.from(json),
        _requiredString(json, 'id'),
        _requiredString(json, 'status'),
        _requiredString(json, 'subjectType'),
      );

  Map<String, dynamic> toJson() => {...raw, 'id': id, 'status': status, 'subjectType': subjectType};
}

class ResidentHelpdeskTicket {
  ResidentHelpdeskTicket._(this.raw, this.id, this.title, this.status);
  final Map<String, dynamic> raw;
  final String id;
  final String title;
  final String status;

  factory ResidentHelpdeskTicket.fromJson(Map<String, dynamic> json) => ResidentHelpdeskTicket._(
        Map<String, dynamic>.from(json),
        _requiredString(json, 'id'),
        _requiredString(json, 'title'),
        _requiredString(json, 'status'),
      );

  Map<String, dynamic> toJson() => {...raw, 'id': id, 'title': title, 'status': status};
}

class ResidentMaintenanceInvoice {
  ResidentMaintenanceInvoice._(this.raw, this.id, this.amountPaise, this.status);
  final Map<String, dynamic> raw;
  final String id;
  final int amountPaise;
  final String status;

  factory ResidentMaintenanceInvoice.fromJson(Map<String, dynamic> json) => ResidentMaintenanceInvoice._(
        Map<String, dynamic>.from(json),
        _requiredString(json, 'id'),
        _requiredInt(json, 'amountPaise'),
        _requiredString(json, 'status'),
      );

  Map<String, dynamic> toJson() => {...raw, 'id': id, 'amountPaise': amountPaise, 'status': status};
}
