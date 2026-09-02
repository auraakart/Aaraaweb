import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('guard app remains behind bootstrap before a session is restored', (tester) async {
    final controller = GuardController(
      api: GuardApi(baseUrl: 'http://127.0.0.1:3000'),
      sessions: const GuardSessionStore(),
      offlineQueue: const OfflineActionQueue(),
    );

    await tester.pumpWidget(AaraagateGuardApp(controller: controller));

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Security shift'), findsNothing);
  });
}
