import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/data/models/guard_boundary_models.dart';

void main() {
  test('guard gate boundary requires stable id and name', () {
    expect(() => GuardGate.fromJson({'id': 'gate-1'}), throwsFormatException);
  });

  test('guard typed boundaries preserve operational payload fields', () {
    final gate = GuardGate.fromJson({'id': 'gate-1', 'name': 'Main Gate', 'active': true});
    final unit = GuardUnit.fromJson({'id': 'unit-1', 'number': 'A-101'});
    final parcel = GuardParcel.fromJson({'id': 'parcel-1', 'status': 'WAITING'});
    expect(gate.toJson()['active'], true);
    expect(unit.toJson()['number'], 'A-101');
    expect(parcel.toJson()['status'], 'WAITING');
  });
}
