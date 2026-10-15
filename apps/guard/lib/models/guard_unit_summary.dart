class GuardUnitSummary {
  const GuardUnitSummary({
    required this.raw,
    required this.id,
    required this.number,
    required this.buildingName,
    required this.buildingCode,
  });

  final Map<String, dynamic> raw;
  final String id;
  final String number;
  final String buildingName;
  final String buildingCode;

  static GuardUnitSummary? tryParse(Map<String, dynamic> json) {
    final id=json['id']?.toString()??'';
    final number=json['number']?.toString()??'';
    final buildingRaw=json['building'];
    if(id.isEmpty||number.isEmpty||buildingRaw is! Map)return null;
    final building=Map<String,dynamic>.from(buildingRaw);
    return GuardUnitSummary(
      raw:Map<String,dynamic>.unmodifiable(json),
      id:id,
      number:number,
      buildingName:building['name']?.toString()??'',
      buildingCode:building['code']?.toString()??'',
    );
  }

  String get label=>'${buildingName.isNotEmpty?buildingName:(buildingCode.isNotEmpty?buildingCode:'Building')} · $number';
}
