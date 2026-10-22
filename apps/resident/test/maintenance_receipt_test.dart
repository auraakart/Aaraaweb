import 'package:aaraagate_resident/data/maintenance_receipt.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('only completed/refunded evidence can be rendered as a receipt', () {
    for(final status in ['CREATED','AUTHORIZED','FAILED',null]) {
      expect(()=>MaintenanceReceipt.fromJson({'amountPaise':100,'status':status}), throwsFormatException);
    }
    for(final amount in [-1,1.25,'100',2147483648]) {
      expect(()=>MaintenanceReceipt.fromJson({'amountPaise':amount,'status':'CAPTURED'}), throwsFormatException);
    }
    final receipt=MaintenanceReceipt.fromJson({'amountPaise':125001,'status':'REFUNDED','receiptNumber':'AGRP-reference'});
    expect(receipt.amount,'₹1250.01');
    expect(receipt.status,'REFUNDED');
    expect(()=>receipt.data['amountPaise']=0, throwsUnsupportedError);
  });
}
