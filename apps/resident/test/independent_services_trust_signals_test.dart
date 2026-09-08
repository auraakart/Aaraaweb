import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/independent_services_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeServicesApiClient extends ApiClient {
  FakeServicesApiClient() : super(baseUrl: 'http://test', accessToken: 'token');

  @override
  Future<dynamic> get(String path) async {
    if (path == '/api/v1/consumer/services/categories') {
      return [
        {'id': '11111111-1111-1111-1111-111111111111', 'name': 'Cleaning'},
      ];
    }
    if (path == '/api/v1/consumer/services/locations') {
      return [
        {
          'type': 'HOME',
          'id': '22222222-2222-2222-2222-222222222222',
          'label': 'Home',
          'addressLine1': '1 Main Road',
          'locality': 'Indiranagar',
          'city': 'Bengaluru',
          'serviceAddressConfigured': true,
        },
      ];
    }
    if (path == '/api/v1/consumer/services/providers/trust') {
      return [
        {
          'providerId': '33333333-3333-3333-3333-333333333333',
          'ratingCount': 12,
          'averageStars': 4.83,
          'completedJobs': 47,
        },
      ];
    }
    if (path.startsWith('/api/v1/consumer/services/offerings?')) {
      return [
        {
          'id': '44444444-4444-4444-4444-444444444444',
          'name': 'Deep cleaning',
          'pricePaise': 149900,
          'providerId': '33333333-3333-3333-3333-333333333333',
          'category': {'name': 'Cleaning'},
          'provider': {
            'id': '33333333-3333-3333-3333-333333333333',
            'businessName': 'Care Services',
          },
        },
      ];
    }
    throw StateError('Unexpected GET $path');
  }
}

void main() {
  testWidgets('external service cards show verified rating and completed-job signals', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: IndependentServicesScreen(apiClient: FakeServicesApiClient()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Deep cleaning'), findsOneWidget);
    expect(find.text('4.8 · 12 ratings'), findsOneWidget);
    expect(find.text('47 completed'), findsOneWidget);
    expect(find.text('Verified'), findsOneWidget);
  });
}
