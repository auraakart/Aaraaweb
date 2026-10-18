import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_operations_screen.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_operation_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const longGate = 'North residential visitor and deliveries entrance';

  for (final dark in <bool>[false, true]) {
    for (final gateSelected in <bool>[false, true]) {
      testWidgets(
        'Guard shift at 320dp / 200%: dark=$dark selected=$gateSelected',
        (tester) async {
          tester.view.physicalSize = const Size(320, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          final controller = GuardController(
            api: GuardApi(baseUrl: 'http://localhost:3000'),
            sessions: const GuardSessionStore(),
            offlineQueue: const OfflineActionQueue(),
          )
            ..booting = false
            ..gateId = gateSelected ? 'gate-1' : null
            ..gates = const [
              {'id': 'gate-1', 'name': longGate},
            ];
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
            home: GuardOperationsScreen(controller: controller),
          ));
          await tester.pumpAndSettle();

          final summary = find.byKey(const ValueKey('guard-shift-summary'));
          expect(summary, findsOneWidget);
          expect(
            find.descendant(
              of: summary,
              matching: find.text(
                gateSelected ? longGate : 'Select a gate to begin operations',
              ),
            ),
            findsOneWidget,
          );
          final surface = tester.widget<GuardOperationSurface>(summary);
          expect(
            surface.semanticLabel,
            gateSelected
                ? 'Security shift active · $longGate'
                : 'Select a gate to begin operations',
          );
          expect(tester.takeException(), isNull);

          if (gateSelected) {
            await tester.tap(find.text('Change active gate'));
            await tester.pumpAndSettle();
          }
          // The form field accepts isExpanded but only its inner button
          // exposes the configured value as a readable widget property.
          final picker = tester.widget<DropdownButton<String>>(
            find.byType(DropdownButton<String>).first,
          );
          expect(picker.isExpanded, isTrue);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
