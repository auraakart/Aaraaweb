import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/models/guard_boundary_models.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_parcels_screen.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _ParcelFixtures extends GuardApi {
  _ParcelFixtures(this.isOverdue) : super(baseUrl: 'http://localhost:3000');
  final bool isOverdue;

  @override
  Future<List<GuardParcel>> parcelDesk() async => [
        GuardParcel(
          id: 'parcel-one',
          unitNumber: 'Tower A / 1001',
          recipientName: 'Anand Krishnamurthy Ramanathan',
          overdue: isOverdue,
          courierName: 'Local courier',
          trackingReference: 'TRACK-2026-1001',
        ),
      ];

  @override
  Future<List<GuardParcelRecipient>> parcelRecipients() async => [];
}

void main() {
  for (final dark in <bool>[false, true]) {
    for (final overdue in <bool>[false, true]) {
      testWidgets(
        'Parcel card at 320dp / 200% keeps identity and actions readable dark=$dark overdue=$overdue',
        (tester) async {
          tester.view.physicalSize = const Size(320, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          final controller = GuardController(
            api: _ParcelFixtures(overdue),
            sessions: const GuardSessionStore(),
            offlineQueue: const OfflineActionQueue(),
          );
          addTearDown(controller.dispose);
          await tester.pumpWidget(MaterialApp(
            theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: const TextScaler.linear(2),
                disableAnimations: true,
              ),
              child: child!,
            ),
            home: GuardParcelsScreen(controller: controller),
          ));
          await tester.pumpAndSettle();

          expect(find.text('Tower A / 1001 · Anand Krishnamurthy Ramanathan'), findsOneWidget);
          expect(find.text('TRACK-2026-1001'), findsOneWidget);
          expect(find.text('OVERDUE'), overdue ? findsOneWidget : findsNothing);
          expect(tester.takeException(), isNull);

          await tester.ensureVisible(find.text('Remind'));
          await tester.pumpAndSettle();
          final remind = tester.widget<OutlinedButton>(
            find.widgetWithText(OutlinedButton, 'Remind'),
          );
          expect(remind.onPressed == null, !overdue);
          expect(
            tester.getSize(find.widgetWithText(OutlinedButton, 'Remind')).width,
            greaterThanOrEqualTo(200),
          );
          expect(
            tester.getSize(find.widgetWithText(OutlinedButton, 'Return')).width,
            greaterThanOrEqualTo(200),
          );
          expect(tester.takeException(), isNull);

          await tester.ensureVisible(find.text('VERIFY PICKUP CODE'));
          await tester.tap(find.text('VERIFY PICKUP CODE'));
          await tester.pumpAndSettle();
          expect(find.text('Verify pickup code'), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
