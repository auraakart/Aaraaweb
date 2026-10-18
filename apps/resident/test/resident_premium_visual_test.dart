import 'support/resident_visual_capture.dart';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/amenities_screen.dart';
import 'package:aaraagate_resident/screens/billing_screen.dart';
import 'package:aaraagate_resident/screens/gate_screen.dart';
import 'package:aaraagate_resident/screens/notices_screen.dart';
import 'package:aaraagate_resident/widgets/premium_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Deterministic presentation fixtures, with no external network or live identities.
class _PresentationApi extends ApiClient {
  _PresentationApi() : super(baseUrl: 'http://test', accessToken: 'fixture');
  int receiptReads = 0;

  @override
  Future<dynamic> get(String path) async {
    if (path == '/api/v1/amenities') return <Map<String, dynamic>>[];
    if (path.contains('/amenities/waitlist/')) return <Map<String, dynamic>>[];
    if (path.contains('/amenities/bookings/')) return [
      {'id': 'booking-one', 'amenityName': 'Community badminton court, north clubhouse',
        'startsAt': '2099-01-01T10:00:00Z', 'status': 'CONFIRMED', 'feePaise': 0,
        'depositPaise': 50000, 'depositStatus': 'PAYMENT_REQUIRED', 'guestCount': 2},
    ];
    if (path == '/api/v1/billing/invoices/payable') return [
      {'id': 'invoice-one', 'unitId': 'unit-one', 'invoiceNumber': 'INV-2026-101',
        'buildingName': 'North garden residential tower', 'unitNumber': 'A-1204',
        'billingPeriod': 'October 2026', 'amountPaise': 425000,
        'dueDate': '2020-01-01', 'status': 'ISSUED'},
    ];
    if (path == '/api/v1/billing/payments/mine') return [
      {'id': 'captured', 'invoiceNumber': 'INV-2026-100', 'amountPaise': 425000,
        'status': 'CAPTURED', 'buildingName': 'North garden residential tower', 'unitNumber': 'A-1204'},
      {'id': 'pending', 'amountPaise': 425000, 'status': 'AUTHORIZED'},
    ];
    if (path.endsWith('/receipt')) {
      receiptReads++;
      return {'receiptNumber': 'VERIFIED-100', 'amountPaise': 425000, 'status': 'CAPTURED',
        'societyName': 'Garden community', 'buildingName': 'North tower', 'unitNumber': 'A-1204', 'invoiceNumber': 'INV-2026-100'};
    }
    if (path.contains('/resident-summary') || path.contains('/insights')) return <String, dynamic>{};
    if (path.contains('/utilities/')) return <Map<String, dynamic>>[];
    throw StateError('Unexpected presentation read: $path');
  }
}


void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadSdkFonts);
  for (final dark in [false, true]) {
    for (final compact in [false, true]) {
      for (final screen in ['gate', 'billing', 'bookings', 'notice']) {
        testWidgets('$screen readable and actionable: dark=$dark compact200=$compact', (tester) async {
          tester.view.physicalSize = Size(compact ? 320 : 390, 844);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final api = _PresentationApi();
          final repository = ResidentRepository(api);
          final controller = ResidentDataController(repository, initialEnabledFeatures: {'NOTICES', 'VISITOR_MANAGEMENT'}, fetchEntitlements: false)
            ..accessRequests = [
              {'id': 'arrival-one', 'subjectName': 'Delivery at north garden entrance', 'subjectType': 'DELIVERY', 'status': 'PENDING'},
            ]
            ..notices = [
              {'id': 'notice-one', 'title': 'Water supply maintenance', 'category': 'MAINTENANCE',
                'publishedAt': '2026-10-17T10:00:00Z', 'requiresAcknowledgement': true,
                'body': List.filled(12, 'Water supply will pause from 10 AM to noon. Please store drinking water before the work begins.').join('\n\n')},
            ];
          final boundary = GlobalKey();
          final page = switch (screen) {
            'gate' => Scaffold(body: GateScreen(controller: controller)),
            'billing' => BillingScreen(repository: repository),
            'bookings' => AmenitiesScreen(repository: repository, unitId: 'unit-one'),
            _ => NoticeDetailScreen(controller: controller, noticeId: 'notice-one'),
          };
          await tester.pumpWidget(RepaintBoundary(
            key: boundary,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: captureTheme(dark),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(compact ? 2 : 1), disableAnimations: true,
                  padding: const EdgeInsets.only(bottom: 24),
                ),
                child: child!,
              ),
              home: page,
            ),
          ));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          final name = '$screen-${dark ? 'dark' : 'light'}-${compact ? '320-200' : '390-100'}';
          if (screen == 'gate') {
            // The Gate's new delivery guidance can move pending actions below
            // the initial 320px / 200% viewport. Build lazy list items by scrolling.
            await tester.scrollUntilVisible(
              find.text('Deny'),
              180,
              scrollable: find.byType(Scrollable).first,
            );
            await tester.pumpAndSettle();
            expect(find.text('Allow entry').hitTestable(), findsOneWidget);
          } else if (screen == 'bookings') {
            await tester.scrollUntilVisible(find.text('Pay deposit'), 240, scrollable: find.byType(Scrollable).first);
            await tester.pumpAndSettle();
            expect(find.text('Pay deposit').hitTestable(), findsOneWidget);
            await tester.ensureVisible(find.ancestor(of: find.text('Pay deposit'), matching: find.byType(PremiumSurface)).first);
            await tester.pumpAndSettle();
            await captureResidentScreen(tester, boundary, name);
            await tester.ensureVisible(find.text('Cancel'));
            await tester.tap(find.text('Cancel'));
            await tester.pumpAndSettle();
            await tester.ensureVisible(find.text('Keep booking'));
            expect(find.text('Keep booking').hitTestable(), findsOneWidget);
            expect(tester.takeException(), isNull);
          } else if (screen == 'billing') {
            await tester.scrollUntilVisible(find.text('Pay securely'), 240, scrollable: find.byType(Scrollable).first);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            await tester.ensureVisible(find.ancestor(of: find.text('Pay securely'), matching: find.byType(PremiumSurface)).first);
            await tester.pumpAndSettle();
            await captureResidentScreen(tester, boundary, '$name-invoice');
            await tester.scrollUntilVisible(find.text('Receipt'), 240, scrollable: find.byType(Scrollable).first);
            await tester.pumpAndSettle();
            // Bring the record itself into view: scrolling to its bottom label
            // alone can leave the card's center above the viewport at 200% type.
            final card = find.ancestor(of: find.text('Receipt'), matching: find.byType(InkWell)).first;
            await tester.ensureVisible(card);
            await tester.pumpAndSettle();
            expect(card.hitTestable(), findsOneWidget);
            expect(tester.getSize(card).height, greaterThanOrEqualTo(48));
            await captureResidentScreen(tester, boundary, name);
            await tester.tap(card);
            await tester.pumpAndSettle();
            expect(api.receiptReads, 1);
            expect(find.text('Receipt VERIFIED-100'), findsOneWidget);
          } else {
            // A long notice does not push the action offscreen or cover the body.
            final action = find.text('Acknowledge notice');
            expect(action.hitTestable(), findsOneWidget);
            final bar = find.ancestor(of: action, matching: find.byType(SafeArea)).first;
            expect(tester.getRect(bar).bottom, lessThanOrEqualTo(844));
            await captureResidentScreen(tester, boundary, name);
            await tester.drag(find.byType(ListView), const Offset(0, -400));
            await tester.pumpAndSettle();
            expect(action.hitTestable(), findsOneWidget);
          }
          if (screen == 'gate') await captureResidentScreen(tester, boundary, name);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
          controller.dispose();
        });
      }
    }
  }
}
