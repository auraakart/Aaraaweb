class MaintenanceReceipt {
  MaintenanceReceipt.fromJson(Map<String,dynamic> json)
      : data = Map.unmodifiable(json),
        amountPaise = _amount(json['amountPaise']),
        status = _status(json['status']);
  final Map<String,dynamic> data;
  final int amountPaise;
  final String status;
  String get number => data['receiptNumber']?.toString() ?? '';
  String get societyName => data['societyName']?.toString() ?? '';
  String get buildingName => data['buildingName']?.toString() ?? '';
  String get unitNumber => data['unitNumber']?.toString() ?? '';
  String get invoiceNumber => data['invoiceNumber']?.toString() ?? '';
  String get amount => '₹${(amountPaise/100).toStringAsFixed(2)}';
  static int _amount(Object? value) {
    if(value is! int || value<0 || value>2147483647) throw const FormatException('Invalid receipt amount');
    return value;
  }
  static String _status(Object? value) {
    if(value!='CAPTURED' && value!='REFUNDED') throw const FormatException('Payment has no verified receipt');
    return value as String;
  }
}
