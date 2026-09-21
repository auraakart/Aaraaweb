class ResidentParcel {
  const ResidentParcel({
    required this.id,
    required this.unitId,
    required this.status,
    required this.overdue,
    this.courierName,
    this.trackingReference,
    this.receivedAt,
  });

  final String id;
  final String unitId;
  final String status;
  final bool overdue;
  final String? courierName;
  final String? trackingReference;
  final DateTime? receivedAt;

  bool get isActive => status == 'RECEIVED';

  factory ResidentParcel.fromJson(Map<String, dynamic> json) => ResidentParcel(
        id: json['id']?.toString() ?? '',
        unitId: json['unitId']?.toString() ?? '',
        status: json['status']?.toString() ?? 'RECEIVED',
        overdue: json['overdue'] == true,
        courierName: json['courierName']?.toString(),
        trackingReference: json['trackingReference']?.toString(),
        receivedAt: DateTime.tryParse(json['receivedAt']?.toString() ?? ''),
      );

  ResidentParcel copyWith({String? status, bool? overdue}) => ResidentParcel(
        id: id,
        unitId: unitId,
        status: status ?? this.status,
        overdue: overdue ?? this.overdue,
        courierName: courierName,
        trackingReference: trackingReference,
        receivedAt: receivedAt,
      );
}

class ParcelPickupCode {
  const ParcelPickupCode({required this.code, this.expiresAt});

  final String code;
  final DateTime? expiresAt;

  factory ParcelPickupCode.fromJson(Map<String, dynamic> json) => ParcelPickupCode(
        code: json['code']?.toString() ?? '',
        expiresAt: DateTime.tryParse(json['expiresAt']?.toString() ?? ''),
      );
}
