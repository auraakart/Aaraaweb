import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_tools_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('guard tools filters a large unit list and exposes regional language choices', (tester) async {
    final controller = GuardController(
      api: GuardApi(baseUrl: 'http://localhost:3000'),
      sessions: const GuardSessionStore(),
      offlineQueue: const OfflineActionQueue(),
    );
    controller.gates = const [
      {'id': 'gate-1', 'name': 'Main Gate'},
    ];
    controller.gateId = 'gate-1';
    controller.units = const [
      {'id': 'u1', 'number': 'A-101', 'building': {'name': 'Alpha'}},
      {'id': 'u2', 'number': 'B-202', 'building': {'name': 'Beta'}},
      {'id': 'u3', 'number': 'C-303', 'building': {'name': 'Gamma'}},
    ];
    controller.queuedActions = 2;

    await tester.pumpWidget(MaterialApp(home: GuardToolsScreen(controller: controller)));

    expect(find.text('Guard tools'), findsOneWidget);
    expect(find.text('SCHOOL TRANSPORT'), findsOneWidget);

    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('हिन्दी · Hindi').last);
    await tester.pumpAndSettle();
    expect(find.text('गार्ड टूल्स'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Alpha · A-101'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Alpha · A-101'), findsOneWidget);

    await tester.scrollUntilVisible(find.byType(TextField), 300, scrollable: find.byType(Scrollable).first);
    await tester.enterText(find.byType(TextField), 'beta');
    await tester.pump();
    await tester.scrollUntilVisible(find.text('Beta · B-202'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Alpha · A-101'), findsNothing);
    expect(find.text('Beta · B-202'), findsOneWidget);
  });
}
