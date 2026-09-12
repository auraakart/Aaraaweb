import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/amenities_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _AmenitiesApi extends ApiClient {
  _AmenitiesApi() : super(baseUrl: 'http://test', accessToken: 'token');

  String? bookingPath;
  Map<String, dynamic>? bookingBody;

  @override
  Future<dynamic> get(String path) async {
    if (path == '/api/v1/amenities') {
      return [
        {'id': 'clubhouse', 'name': 'Clubhouse', 'slotMinutes': 60, 'feePaise': 0, 'requiresApproval': false},
      ];
    }
    if (path == '/api/v1/amenities/bookings/mine?unitId=unit-1') return <Map<String, dynamic>>[];
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    bookingPath = path;
    bookingBody = body;
    return {'id': 'booking-1', 'status': 'CONFIRMED'};
  }
}

void main() {
  testWidgets('amenity sheet selects a slot and submits the selected property window', (tester) async {
    final api = _AmenitiesApi();
    await tester.pumpWidget(
      MaterialApp(home: AmenitiesScreen(repository: ResidentRepository(api), unitId: 'unit-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Choose a slot'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select start time'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Check & book'));
    await tester.tap(find.text('Check & book'));
    await tester.pumpAndSettle();

    expect(api.bookingPath, '/api/v1/amenities/clubhouse/bookings');
    expect(api.bookingBody?['unitId'], 'unit-1');
    final startsAt = DateTime.parse(api.bookingBody!['startsAt'].toString());
    final endsAt = DateTime.parse(api.bookingBody!['endsAt'].toString());
    expect(endsAt.difference(startsAt), const Duration(minutes: 60));
    expect(tester.takeException(), isNull);
  });
}
