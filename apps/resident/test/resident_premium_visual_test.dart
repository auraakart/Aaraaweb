import 'dart:io';
import 'dart:ui' as ui;
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/amenities_screen.dart';
import 'package:aaraagate_resident/screens/billing_screen.dart';
import 'package:aaraagate_resident/screens/gate_screen.dart';
import 'package:aaraagate_resident/screens/notices_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
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

// Use the SDK's bundled fonts rather than Ahem blocks in captured Flutter images.
Future<void> _loadSdkFonts() async {
  var root = Directory(Platform.environment['FLUTTER_ROOT'] ?? File(Platform.resolvedExecutable).parent.path);
  for (var level = 0; level < 8; level++) {
    final directory = Directory('${root.path}/bin/cache/artifacts/material_fonts');
    if (directory.existsSync()) {
      for (final entry in [('Roboto', 'Roboto-Regular.ttf'), ('MaterialIcons', 'MaterialIcons-Regular.otf')]) {
        final file = File('${directory.path}/${entry.$2}');
        if (file.existsSync()) {
          final loader = FontLoader(entry.$1)..addFont(file.readAsBytes().then(ByteData.sublistView));
          await loader.load();
        }
      }
      return;
    }
    root = root.parent;
  }
}

Future<void> _capture(WidgetTester tester, GlobalKey key, String name) async {
  await tester.runAsync(() async {
    final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    try {
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final directory = Directory('coverage/resident-ux');
      await directory.create(recursive: true);
      await File('${directory.path}/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    } finally {
      image.dispose();
    }
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(_loadSdkFonts);
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
              theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
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
            await tester.ensureVisible(find.text('Deny'));
            await tester.pumpAndSettle();
            expect(find.text('Allow entry').hitTestable(), findsOneWidget);
          } else if (screen == 'bookings') {
            await tester.scrollUntilVisible(find.text('Pay deposit'), 240, scrollable: find.byType(Scrollable).first);
            await tester.pumpAndSettle();
            expect(find.text('Pay deposit').hitTestable(), findsOneWidget);
            await _capture(tester, boundary, name);
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
            await _capture(tester, boundary, '$name-invoice');
            await tester.scrollUntilVisible(find.text('Receipt'), 240, scrollable: find.byType(Scrollable).first);
            await tester.pumpAndSettle();
            await _capture(tester, boundary, name);
            // Any point on the receipt record can open it, including its title.
            final card = find.ancestor(of: find.text('Receipt'), matching: find.byType(InkWell)).first;
            expect(tester.getSize(card).height, greaterThanOrEqualTo(48));
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
            await _capture(tester, boundary, name);
            await tester.drag(find.byType(ListView), const Offset(0, -400));
            await tester.pumpAndSettle();
            expect(action.hitTestable(), findsOneWidget);
          }
          if (screen == 'gate') await _capture(tester, boundary, name);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
          controller.dispose();
        });
      }
    }
  }
}
