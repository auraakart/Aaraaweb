import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

GuardController _controller() => GuardController(
      api: GuardApi(baseUrl: 'http://127.0.0.1:3000'),
      sessions: const GuardSessionStore(),
      offlineQueue: const OfflineActionQueue(),
    );

void main() {
  testWidgets('guard app remains behind bootstrap before a session is restored', (tester) async {
    final controller = _controller();

    await tester.pumpWidget(AaraagateGuardApp(controller: controller));

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Security shift'), findsNothing);
  });

  testWidgets('guard app follows system appearance with light and dark themes configured', (tester) async {
    final controller = _controller();

    await tester.pumpWidget(AaraagateGuardApp(controller: controller));

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.themeMode, ThemeMode.system);
    expect(app.theme?.brightness, Brightness.light);
    expect(app.darkTheme?.brightness, Brightness.dark);
  });
}
