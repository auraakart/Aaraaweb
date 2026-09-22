class ResidentSosIncident {
  const ResidentSosIncident({
    required this.id,
    required this.unitId,
    required this.status,
    this.message,
    this.createdAt,
  });

  final String id;
  final String unitId;
  final String status;
  final String? message;
  final DateTime? createdAt;

  bool get isActive => status == 'TRIGGERED' || status == 'ACKNOWLEDGED';

  factory ResidentSosIncident.fromJson(Map<String, dynamic> json) => ResidentSosIncident(
        id: json['id']?.toString() ?? '',
        unitId: json['unitId']?.toString() ?? '',
        status: json['status']?.toString() ?? 'TRIGGERED',
        message: json['message']?.toString(),
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
      );
}
