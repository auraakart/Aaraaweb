import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/data/models/guard_boundary_models.dart';

void main() {
  test('guard gate boundary requires stable id and name', () {
    expect(() => GuardGate.fromJson({'id': 'gate-1'}), throwsFormatException);
  });

  test('guard typed boundaries preserve operational payload fields', () {
    final gate = GuardGate.fromJson({'id': 'gate-1', 'name': 'Main Gate', 'active': true});
    final unit = GuardUnit.fromJson({'id': 'unit-1', 'number': 'A-101'});
    final parcel = GuardParcel.fromJson({'id': 'parcel-1', 'unitNumber': 'A-101', 'recipientName': 'Resident', 'overdue': true});
    final recipient = GuardParcelRecipient.fromJson({'unitId': 'unit-1', 'userId': 'user-1', 'unitNumber': 'A-101', 'name': 'Resident', 'buildingName': 'A'});
    expect(gate.toJson()['active'], true);
    expect(unit.toJson()['number'], 'A-101');
    expect(parcel.overdue, true);
    expect(recipient.selectionKey, 'unit-1:user-1');
  });

  test('guard parcel recipient boundary rejects incomplete identity', () {
    expect(() => GuardParcelRecipient.fromJson({'unitId': 'unit-1'}), throwsFormatException);
  });
}

