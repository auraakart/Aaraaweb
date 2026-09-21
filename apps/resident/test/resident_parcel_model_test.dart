import 'package:flutter_test/flutter_test.dart';
import 'package:resident_app/data/models/resident_parcel.dart';

void main() {
  test('ResidentParcel parses API payloads into typed state', () {
    final parcel = ResidentParcel.fromJson({
      'id': 'parcel-1',
      'unitId': 'unit-1',
      'status': 'RECEIVED',
      'overdue': true,
      'courierName': 'BlueDart',
      'trackingReference': 'BD-100',
      'receivedAt': '2026-09-21T12:00:00.000Z',
    });

    expect(parcel.id, 'parcel-1');
    expect(parcel.unitId, 'unit-1');
    expect(parcel.isActive, isTrue);
    expect(parcel.overdue, isTrue);
    expect(parcel.courierName, 'BlueDart');
    expect(parcel.receivedAt, isNotNull);
  });

  test('ParcelPickupCode parses the typed pickup-code response', () {
    final code = ParcelPickupCode.fromJson({
      'code': '482731',
      'expiresAt': '2026-09-21T12:10:00.000Z',
    });

    expect(code.code, '482731');
    expect(code.expiresAt, isNotNull);
  });
}
