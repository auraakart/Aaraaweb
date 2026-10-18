import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/screens/gate_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  for (final code in <String>['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn']) {
    for (final dark in <bool>[false, true]) {
      testWidgets('localized Gate identity and actions at 320px / 200%: $code dark=$dark', (tester) async {
        tester.view.physicalSize = const Size(320, 780);
        tester.view.devicePixelRatio = 1;
        binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(binding.platformDispatcher.clearLocaleTestValue);

        final strings = AaraagateStrings.device();
        expect(strings.languageCode, code);
        final controller = ResidentDataController(
          ResidentRepository(ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test')),
          activeUnitId: 'unit-1',
          fetchEntitlements: false,
        )..accessRequests = [
          {
            'id': 'delivery-localized',
            'subjectType': 'DELIVERY',
            'subjectName': 'Delivery partner',
            'status': 'PENDING',
          },
        ];
        addTearDown(controller.dispose);
        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(2),
              disableAnimations: true,
            ),
            child: child!,
          ),
          home: Scaffold(body: GateScreen(controller: controller)),
        ));
        await tester.pumpAndSettle();

        expect(find.text(strings.text('gateTitle')), findsOneWidget);
        expect(find.text(strings.text('inviteGuest')), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text(strings.text('deliveryNoQr')),
          180,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(find.text(strings.text('deliveryNoQr')), findsOneWidget);
        // At 200% type, the lower lazy-list sections are not built
        // until they enter the viewport. Scroll rather than assuming
        // offscreen widgets exist or disabling hit-test checks.
        await tester.scrollUntilVisible(
          find.text(strings.text('needsAttention')),
          180,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(find.text(strings.text('needsAttention')), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text(strings.text('allowEntry')),
          180,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(find.text(strings.text('allowEntry')), findsOneWidget);
        expect(find.text(strings.text('deny')), findsOneWidget);
        final spoken = tester.widgetList<Semantics>(find.byType(Semantics))
            .map((widget) => widget.properties.label)
            .whereType<String>();
        expect(
          spoken,
          contains('Delivery partner, ${strings.text('delivery')}, ${strings.text('waiting')}'),
        );
        expect(tester.takeException(), isNull);
      });
    }
  }
}
