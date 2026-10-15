import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/independent_home_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class IndependentShellApiClient extends ApiClient {
  IndependentShellApiClient() : super(baseUrl: 'http://test', accessToken: 'token');

  @override
  Future<dynamic> get(String path) async {
    if (path == '/api/v1/consumer/services/categories') return const [];
    if (path == '/api/v1/consumer/services/providers/trust') return const [];
    if (path == '/api/v1/consumer/services/favorites') return const [];
    if (path == '/api/v1/consumer/services/recent-providers') return const [];
    if (path == '/api/v1/consumer/services/locations') {
      return [
        {
          'type': 'HOME',
          'id': '22222222-2222-2222-2222-222222222222',
          'label': 'My Home',
          'addressLine1': '1 Main Road',
          'locality': 'Indiranagar',
          'city': 'Bengaluru',
          'serviceAddressConfigured': true,
        },
      ];
    }
    if (path.startsWith('/api/v1/consumer/services/offerings?')) {
      return [
        {
          'id': '44444444-4444-4444-4444-444444444444',
          'name': 'AC repair',
          'pricePaise': 99900,
          'providerId': '33333333-3333-3333-3333-333333333333',
          'category': {'name': 'AC & Appliances'},
          'provider': {
            'id': '33333333-3333-3333-3333-333333333333',
            'businessName': 'CoolCare',
          },
        },
      ];
    }
    if (path.startsWith('/api/v1/consumer/services/offers?')) {
      return [
        {
          'id': '55555555-5555-5555-5555-555555555555',
          'providerId': '33333333-3333-3333-3333-333333333333',
          'providerName': 'CoolCare',
          'offeringId': '44444444-4444-4444-4444-444444444444',
          'offeringName': 'AC repair',
          'title': 'Summer service offer',
          'discountType': 'PERCENT',
          'discountValue': 1000,
          'endsAt': '2026-09-30T00:00:00.000Z',
        },
      ];
    }
    if (path.startsWith('/api/v1/consumer/services/commercial-placements?')) {
      return [
        {
          'id': '66666666-6666-6666-6666-666666666666',
          'name': 'Deep AC service',
          'pricePaise': 149900,
          'durationMinutes': 90,
          'categoryId': '77777777-7777-7777-7777-777777777777',
          'categoryName': 'AC & Appliances',
          'providerId': '88888888-8888-8888-8888-888888888888',
          'providerName': 'Premium AirCare',
          'providerDescription': 'Home AC specialists',
          'commercialPlacement': 'SPONSORED',
          'subscriptionTier': 'PREMIUM',
        },
      ];
    }
    if (path == '/api/v1/consumer/services/bookings') return const [];
    if (path.startsWith('/api/v1/consumer/services/history?')) return const [];
    throw StateError('Unexpected GET $path');
  }
}

void main() {
  testWidgets('independent-home shell exposes service-only navigation and clearly labeled paid placements', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: IndependentHomeShell(
          apiClient: IndependentShellApiClient(),
          onSignOut: () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Services'), findsOneWidget);
    expect(find.text('Offers'), findsOneWidget);
    expect(find.text('Bookings'), findsOneWidget);
    expect(find.text('History'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('Gate'), findsNothing);
    expect(find.text('Maintenance'), findsNothing);

    await tester.tap(find.text('Offers'));
    await tester.pumpAndSettle();

    expect(find.text('Featured services'), findsOneWidget);
    expect(find.text('Sponsored'), findsOneWidget);
    expect(find.text('Premium AirCare'), findsOneWidget);
    expect(find.textContaining('paid visibility is separate from trust status'), findsOneWidget);
    expect(find.text('Summer service offer'), findsOneWidget);
    expect(find.text('10% off'), findsOneWidget);
    expect(find.text('CoolCare'), findsOneWidget);
  });
}
