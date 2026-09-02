import 'package:aaraagate_resident/auth/auth_repository.dart';
import 'package:aaraagate_resident/auth/resident_auth_controller.dart';
import 'package:aaraagate_resident/auth/session_store.dart';
import 'package:aaraagate_resident/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('resident app starts behind the authentication gate', (tester) async {
    final controller = ResidentAuthController(
      repository: AuthRepository(baseUrl: 'http://127.0.0.1:3000'),
      sessionStore: SessionStore(),
    );

    await tester.pumpWidget(
      AaraagateResidentApp(
        apiBaseUrl: 'http://127.0.0.1:3000',
        authController: controller,
      ),
    );

    expect(find.text('Welcome to AuraGate'), findsOneWidget);
    expect(find.byType(ResidentHomeShell), findsNothing);
  });
}
