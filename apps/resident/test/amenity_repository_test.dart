import 'package:aaraagate_resident/data/amenity_actions.dart';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient() : super(baseUrl: 'http://localhost', accessToken: 'token');

  String? method;
  String? path;
  Map<String, dynamic>? body;

  @override
  Future<dynamic> get(String path) async {
    method = 'GET';
    this.path = path;
    return <Map<String, dynamic>>[];
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    method = 'POST';
    this.path = path;
    this.body = body;
    return {'id': 'booking-1', 'status': 'CONFIRMED'};
  }

  @override
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async {
    method = 'PATCH';
    this.path = path;
    this.body = body;
    return {'id': 'booking-1', 'status': 'CANCELLED'};
  }
}

void main() {
  test('loads amenity bookings for the selected property only', () async {
    final api = FakeApiClient();
    final repository = ResidentRepository(api);

    await repository.amenityBookings('unit-22');

    expect(api.method, 'GET');
    expect(api.path, '/api/v1/amenities/bookings/mine?unitId=unit-22');
  });

  test('creates an amenity booking with selected unit and UTC window', () async {
    final api = FakeApiClient();
    final repository = ResidentRepository(api);
    final startsAt = DateTime.utc(2027, 1, 2, 10);
    final endsAt = DateTime.utc(2027, 1, 2, 11);

    await repository.createAmenityBooking(
      amenityId: 'amenity-1',
      unitId: 'unit-22',
      startsAt: startsAt,
      endsAt: endsAt,
    );

    expect(api.method, 'POST');
    expect(api.path, '/api/v1/amenities/amenity-1/bookings');
    expect(api.body, {
      'unitId': 'unit-22',
      'startsAt': '2027-01-02T10:00:00.000Z',
      'endsAt': '2027-01-02T11:00:00.000Z',
    });
  });

  test('cancels only the selected booking id', () async {
    final api = FakeApiClient();
    final repository = ResidentRepository(api);

    await repository.cancelAmenityBooking('booking-1');

    expect(api.method, 'PATCH');
    expect(api.path, '/api/v1/amenities/bookings/booking-1/cancel');
  });
}
