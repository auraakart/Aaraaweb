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
    if (path == '/api/v1/amenities/waitlist/mine?unitId=unit-1') return <Map<String, dynamic>>[];
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    bookingPath = path;
    bookingBody = body;
    return {'id': 'booking-1', 'status': 'CONFIRMED'};
  }
}


class _FullAmenityApi extends _AmenitiesApi {
  String? waitlistPath;
  Map<String,dynamic>? waitlistBody;

  @override
  Future<dynamic> post(String path,[Map<String,dynamic>? body]) async {
    if(path.endsWith('/bookings')){
      bookingPath=path;
      bookingBody=body;
      throw ApiException(409,'Amenity slot is no longer available');
    }
    if(path.endsWith('/waitlist')){
      waitlistPath=path;
      waitlistBody=body;
      return {'id':'wait-1','status':'WAITING','position':2};
    }
    return super.post(path,body);
  }
}

class _AmenityCancellationApi extends _AmenitiesApi {
  _AmenityCancellationApi({required this.raceToStatus, this.cutoffConflict = false});

  final String? raceToStatus;
  final bool cutoffConflict;
  int bookingReads = 0;
  int cancelCalls = 0;

  @override
  Future<dynamic> get(String path) async {
    if (path == '/api/v1/amenities/bookings/mine?unitId=unit-1') {
      bookingReads++;
      final status = bookingReads > 1 && raceToStatus != null ? raceToStatus! : 'CONFIRMED';
      return [
        {
          'id': 'booking-race',
          'amenityName': 'Clubhouse',
          'startsAt': '2099-01-01T10:00:00Z',
          'status': status,
          'feePaise': 0,
        },
      ];
    }
    return super.get(path);
  }

  @override
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async {
    if (path == '/api/v1/amenities/bookings/booking-race/cancel') {
      cancelCalls++;
      if (cutoffConflict) {
        throw ApiException(409, 'Booking cannot be cancelled within 60 minutes of start time');
      }
      throw ApiException(409, 'Booking changed; refresh and retry');
    }
    return super.patch(path, body);
  }
}

void main() {
  testWidgets('amenity sheet selects a slot and submits the selected property window', (tester) async {
    final api = _AmenitiesApi();
    await tester.pumpWidget(
      MaterialApp(home: AmenitiesScreen(repository: ResidentRepository(api), unitId: 'unit-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Choose date & time'));
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

  testWidgets('capacity conflict asks before joining the exact-slot waitlist',(tester)async{
    final api=_FullAmenityApi();
    await tester.pumpWidget(MaterialApp(home:AmenitiesScreen(repository:ResidentRepository(api),unitId:'unit-1')));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Choose date & time'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select start time'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Check & book'));
    await tester.tap(find.text('Check & book'));
    await tester.pumpAndSettle();

    expect(find.text('Slot just filled'),findsOneWidget);
    expect(api.waitlistPath,isNull);
    await tester.tap(find.text('Join waitlist'));
    await tester.pumpAndSettle();

    expect(api.waitlistPath,'/api/v1/amenities/clubhouse/waitlist');
    expect(api.waitlistBody?['unitId'],'unit-1');
    expect(api.waitlistBody?['startsAt'],api.bookingBody?['startsAt']);
    expect(api.waitlistBody?['endsAt'],api.bookingBody?['endsAt']);
    expect(tester.takeException(),isNull);
  });
  testWidgets('failed amenity cancellation reloads authoritative booking state before messaging', (tester) async {
    final api = _AmenityCancellationApi(raceToStatus: 'CANCELLED');
    await tester.pumpWidget(
      MaterialApp(home: AmenitiesScreen(repository: ResidentRepository(api), unitId: 'unit-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel booking'));
    await tester.pumpAndSettle();

    expect(api.cancelCalls, 1);
    expect(api.bookingReads, greaterThanOrEqualTo(2));
    expect(find.text('Booking changed. Latest status: Cancelled.'), findsOneWidget);
    expect(find.text('Cancel'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('amenity cancellation cutoff preserves the server conflict reason', (tester) async {
    final api = _AmenityCancellationApi(raceToStatus: null, cutoffConflict: true);
    await tester.pumpWidget(
      MaterialApp(home: AmenitiesScreen(repository: ResidentRepository(api), unitId: 'unit-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel booking'));
    await tester.pumpAndSettle();

    expect(api.cancelCalls, 1);
    expect(api.bookingReads, greaterThanOrEqualTo(2));
    expect(find.text('Booking cannot be cancelled within 60 minutes of start time.'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

}
