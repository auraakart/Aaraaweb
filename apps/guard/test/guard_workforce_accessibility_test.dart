import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/models/guard_boundary_models.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_workforce_screen.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _StaffApi extends GuardApi {
  _StaffApi() : super(baseUrl: 'http://localhost:3000');

  @override
  Future<List<GuardWorkforceAssignment>> eligibleWorkforce({String? query}) async => [
        GuardWorkforceAssignment.fromJson({
          'id': 'assignment-1',
          'worker': {'name': 'Lakshmi', 'role': 'MAID'},
          'household': {
            'unit': {
              'number': 'A-101',
              'building': {'name': 'Alpha', 'code': 'A'},
            },
          },
        }),
      ];

  @override
  Future<List<GuardSocietyWorker>> eligibleSocietyWorkforce({required String gateId, String? query}) async => [
        GuardSocietyWorker.fromJson({
          'id': 'worker-1',
          'name': 'Ravi',
          'role': 'GARDENER',
          'department': 'GARDENING',
          'present': false,
        }),
      ];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  for (final dark in [false, true]) {
    testWidgets('attendance buttons identify the worker and unit in ${dark ? 'dark' : 'light'} mode', (tester) async {
      final controller = GuardController(
        api: _StaffApi(),
        sessions: const GuardSessionStore(),
        offlineQueue: const OfflineActionQueue(),
      )
        ..session = const GuardSession(
          sessionId: 'session-1',
          accessToken: 'test-token',
          refreshToken: 'refresh-token',
          userId: 'guard-1',
          societyId: 'society-1',
        )
        ..gateId = 'gate-1';

      await tester.pumpWidget(MaterialApp(
        theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
        home: GuardWorkforceScreen(controller: controller),
      ));
      await tester.pumpAndSettle();

      Finder semanticLabel(String label) => find.byWidgetPredicate(
            (widget) => widget is Semantics && widget.properties.label == label,
            skipOffstage: false,
          );

      expect(semanticLabel('Check in society worker Ravi'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Lakshmi'), 250, scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      expect(semanticLabel('Check in household worker Lakshmi at Alpha A-101'), findsOneWidget);
      expect(semanticLabel('Check out household worker Lakshmi at Alpha A-101'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      controller.dispose();
    });
  }
}
