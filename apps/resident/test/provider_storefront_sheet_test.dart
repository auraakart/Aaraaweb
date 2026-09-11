import 'package:aaraagate_resident/screens/provider_storefront_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('provider storefront shows trust, service and booking action', (tester) async {
    var booked = false;
    final offering = <String, dynamic>{
      'name': 'Deep cleaning',
      'description': 'Full-home deep cleaning',
      'pricePaise': 149900,
      'durationMinutes': 180,
      'category': {'name': 'Cleaning'},
      'provider': {
        'businessName': 'Care Services',
        'description': 'Trusted home-care team',
        'ratingAverage': 4.8,
        'ratingCount': 12,
        'completedJobs': 47,
      },
    };

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ProviderStorefrontSheet(offering: offering, onBook: () => booked = true),
        ),
      ),
    );

    expect(find.text('Care Services'), findsOneWidget);
    expect(find.text('Verified'), findsOneWidget);
    expect(find.text('4.8 (12)'), findsOneWidget);
    expect(find.text('47 completed'), findsOneWidget);
    expect(find.text('₹1499'), findsOneWidget);
    expect(find.text('Approx. 180 minutes'), findsOneWidget);

    await tester.tap(find.text('Request / book service'));
    await tester.pump();
    expect(booked, isTrue);
  });

  testWidgets('provider storefront separates premium from sponsored and shows approved offers', (tester) async {
    final offering = <String, dynamic>{
      'name': 'AC service',
      'pricePaise': 59900,
      'category': {'name': 'AC & Appliances'},
      'provider': {'businessName': 'CoolCare'},
    };
    final experience = <String, dynamic>{
      'provider': {'businessName': 'CoolCare', 'description': 'AC specialists', 'qualityTier': 'PREMIUM'},
      'qualityTier': 'PREMIUM',
      'promotion': {'label': 'Featured placement'},
      'media': <Map<String, dynamic>>[],
      'offers': [
        {
          'title': 'Resident special',
          'discountType': 'PERCENT',
          'discountValue': 1500,
          'description': 'Valid on AC service',
          'terms': 'One use per household',
        },
      ],
    };

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ProviderStorefrontSheet(offering: offering, experience: experience, onBook: () {}),
        ),
      ),
    );

    expect(find.text('Premium'), findsOneWidget);
    expect(find.text('Sponsored'), findsOneWidget);
    expect(find.text('Resident special'), findsOneWidget);
    expect(find.text('15% off'), findsOneWidget);
    expect(find.textContaining('does not change this provider'), findsOneWidget);
  });
}
