import 'package:aaraagate_resident/auth/auth_repository.dart';
import 'package:aaraagate_resident/auth/resident_auth_controller.dart';
import 'package:aaraagate_resident/auth/session_store.dart';
import 'package:aaraagate_resident/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  ResidentAuthController controller() => ResidentAuthController(
        repository: AuthRepository(baseUrl: 'http://127.0.0.1:3000'),
        sessionStore: SessionStore(),
      );

  testWidgets('resident app starts behind the authentication gate', (tester) async {
    final authController = controller();

    await tester.pumpWidget(
      AaraagateResidentApp(
        apiBaseUrl: 'http://127.0.0.1:3000',
        authController: authController,
      ),
    );

    expect(find.text('Welcome to Aaraagate'), findsOneWidget);
    expect(find.byType(ResidentHomeShell), findsNothing);
    authController.dispose();
  });

  testWidgets('resident app follows system appearance with light and dark themes', (tester) async {
    final authController = controller();

    await tester.pumpWidget(
      AaraagateResidentApp(
        apiBaseUrl: 'http://127.0.0.1:3000',
        authController: authController,
      ),
    );

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.themeMode, ThemeMode.system);
    expect(app.theme?.brightness, Brightness.light);
    expect(app.darkTheme?.brightness, Brightness.dark);
    authController.dispose();
  });
}
