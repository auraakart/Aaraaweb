import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/widgets/consumer_benefits_readiness_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _BenefitsClient extends ApiClient {
  _BenefitsClient() : super(baseUrl: 'http://test', accessToken: 'token');

  int reads = 0;
  int writes = 0;
  bool denied = false;
  Map<String, dynamic> response = {
    'readOnly': true,
    'activitySource': 'AUTHENTICATED_COMPLETED_BOOKINGS',
    'historicalActivityOnly': true,
    'completedBookings': 8,
    'completedProviders': 3,
    'eligibilityDetermined': false,
    'membership': {
      'status': 'NOT_LAUNCHED',
      'enrollmentAvailable': false,
      'activeEntitlement': null,
      'pricePaise': null,
    },
    'loyalty': {
      'status': 'NOT_LAUNCHED',
      'pointsBalance': null,
      'redeemableAmountPaise': null,
      'earnRate': null,
      'redemptionEnabled': false,
    },
    'optionalProtection': {
      'status': 'NOT_OFFERED',
      'coverageConfirmed': false,
      'claimAvailable': false,
      'terms': null,
    },
    'bookingCreated': false,
    'chargeAuthorized': false,
  };

  @override
  Future<dynamic> get(String path) async {
    expect(path, '/api/v1/consumer/services/benefits-readiness');
    reads++;
    if (denied) throw ApiException(403, 'Access denied');
    return response;
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    writes++;
    throw StateError('Benefits information must never POST');
  }

  @override
  Future<dynamic> put(String path, [Map<String, dynamic>? body]) async {
    writes++;
    throw StateError('Benefits information must never PUT');
  }

  @override
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async {
    writes++;
    throw StateError('Benefits information must never PATCH');
  }
}

Widget _host(_BenefitsClient api) => MaterialApp(
  home: Scaffold(body: ConsumerBenefitsReadinessPanel(apiClient: api)),
);

void main() {
  testWidgets('shows historical activity without inventing entitlements or coverage', (tester) async {
    final api = _BenefitsClient();
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();

    expect(find.text('Completed services: 8'), findsOneWidget);
    expect(find.text('Service providers used: 3'), findsOneWidget);
    expect(find.text('Membership: Not launched'), findsOneWidget);
    expect(find.text('Loyalty rewards: Not launched'), findsOneWidget);
    expect(find.text('Optional protection: Not offered'), findsOneWidget);
    expect(find.textContaining('do not automatically qualify'), findsOneWidget);
    expect(find.textContaining('Enroll'), findsNothing);
    expect(find.textContaining('Redeem'), findsNothing);
    expect(api.reads, 1);
    expect(api.writes, 0);
    api.close();
  });

  testWidgets('reports empty service history without making an offer', (tester) async {
    final api = _BenefitsClient();
    api.response = {...api.response, 'completedBookings': 0, 'completedProviders': 0};
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    expect(find.text('No completed services recorded yet.'), findsOneWidget);
    expect(find.text('Completed services: 0'), findsOneWidget);
    expect(find.text('Membership: Not launched'), findsOneWidget);
    expect(api.writes, 0);
    api.close();
  });

  testWidgets('denied response fails closed and explicit retry restores the read-only view', (tester) async {
    final api = _BenefitsClient()..denied = true;
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    expect(find.text('Retry benefits information'), findsOneWidget);
    expect(find.text('Completed services: 8'), findsNothing);

    api.denied = false;
    await tester.tap(find.text('Retry benefits information'));
    await tester.pumpAndSettle();
    expect(find.text('Completed services: 8'), findsOneWidget);
    expect(api.reads, 2);
    expect(api.writes, 0);
    api.close();
  });

  testWidgets('rejects a misleading benefits entitlement response', (tester) async {
    final api = _BenefitsClient();
    api.response = {
      ...api.response,
      'membership': {
        ...(api.response['membership'] as Map<String, dynamic>),
        'enrollmentAvailable': true,
      },
    };
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    expect(find.text('Retry benefits information'), findsOneWidget);
    expect(find.text('Membership: Not launched'), findsNothing);
    expect(api.writes, 0);
    api.close();
  });

  testWidgets('refreshes from server without changing booking or benefits state', (tester) async {
    final api = _BenefitsClient();
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    api.response = {...api.response, 'completedBookings': 9, 'completedProviders': 3};
    await tester.tap(find.text('Refresh service activity'));
    await tester.pumpAndSettle();
    expect(find.text('Completed services: 9'), findsOneWidget);
    expect(api.reads, 2);
    expect(api.writes, 0);
    api.close();
  });
}
