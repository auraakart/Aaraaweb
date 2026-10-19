import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/models/guard_boundary_models.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_parcels_screen.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _IntakeApi extends GuardApi {
  _IntakeApi() : super(baseUrl: 'http://localhost:3000');

  Map<String, String?>? submitted;

  @override
  Future<List<GuardParcel>> parcelDesk() async => const [];

  @override
  Future<List<GuardParcelRecipient>> parcelRecipients() async => [
        GuardParcelRecipient(
          unitId: 'unit-1',
          userId: 'resident-1',
          unitNumber: 'Tower A / 1001',
          buildingLabel: 'North residential building',
          name: 'Anand Krishnamurthy Ramanathan',
        ),
      ];

  @override
  Future<Map<String, dynamic>> intakeParcel({
    required String unitId,
    required String recipientUserId,
    String? courierName,
    String? trackingReference,
    String? notes,
  }) async {
    submitted = {
      'unitId': unitId,
      'recipientUserId': recipientUserId,
      'courierName': courierName,
    };
    return {'id': 'parcel-created'};
  }
}

void main() {
  const fullRecipient =
      'North residential building · Tower A / 1001 · Anand Krishnamurthy Ramanathan';

  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      testWidgets(
        'Parcel intake preserves recipient and submit access at text=$scale dark=$dark',
        (tester) async {
          tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          final api = _IntakeApi();
          final controller = GuardController(
            api: api,
            sessions: const GuardSessionStore(),
            offlineQueue: const OfflineActionQueue(),
          );
          addTearDown(controller.dispose);
          await tester.pumpWidget(MaterialApp(
            theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(scale),
                disableAnimations: true,
              ),
              child: child!,
            ),
            home: GuardParcelsScreen(controller: controller),
          ));
          await tester.pumpAndSettle();

          await tester.tap(find.text('RECEIVE'));
          await tester.pumpAndSettle();
          expect(find.text('Receive parcel'), findsOneWidget);
          expect(
            find.byKey(const ValueKey('parcel-selected-recipient')),
            scale == 2 ? findsOneWidget : findsNothing,
          );
          if (scale == 2) {
            final identity = tester.widget<Text>(
              find.byKey(const ValueKey('parcel-selected-recipient')),
            );
            expect(identity.data, fullRecipient);
            expect(identity.maxLines, isNull);
          }
          expect(tester.takeException(), isNull);

          await tester.enterText(
            find.widgetWithText(TextField, 'Courier / provider'),
            'Local courier',
          );
          final submit = find.byKey(const ValueKey('parcel-intake-submit'));
          await tester.ensureVisible(submit);
          await tester.pumpAndSettle();
          expect(tester.getSize(submit).width, greaterThanOrEqualTo(270));
          await tester.tap(submit);
          await tester.pumpAndSettle();

          expect(api.submitted, {
            'unitId': 'unit-1',
            'recipientUserId': 'resident-1',
            'courierName': 'Local courier',
          });
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
