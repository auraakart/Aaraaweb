import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/screens/helpdesk_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _RefreshHelpdeskRepository extends ResidentRepository {
  _RefreshHelpdeskRepository() : super(
    ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test'),
  );
  bool failLoad = false;

  @override
  Future<List<Map<String, dynamic>>> helpdeskTickets() async {
    if (failLoad) throw StateError('Network unavailable');
    return [
      {
        'id': 'ticket-1', 'unitId': 'unit-1',
        'title': 'Water leak', 'status': 'OPEN',
        'buildingName': 'A Block', 'unitNumber': '101',
        'priority': 'NORMAL',
      },
    ];
  }
}

void main() {
  for (final dark in <bool>[false, true]) {
    testWidgets('Helpdesk preserves last-known tickets on refresh error, dark=$dark', (tester) async {
      tester.view.physicalSize = const Size(390, 850);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repository = _RefreshHelpdeskRepository();
      final controller = ResidentDataController(
        repository, activeUnitId: 'unit-1', fetchEntitlements: false,
      )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
      addTearDown(controller.dispose);
      final strings = AaraagateStrings.device();

      await tester.pumpWidget(MaterialApp(
        theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
        home: HelpdeskScreen(controller: controller),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Water leak'), findsOneWidget);
      repository.failLoad = true;
      final refresh = tester.state<RefreshIndicatorState>(
        find.byType(RefreshIndicator),
      ).show();
      await tester.pumpAndSettle();
      await refresh;
      expect(find.text(strings.text('helpdeskLoadFailed')), findsOneWidget);
      expect(find.text(strings.text('helpdeskRetry')), findsOneWidget);
      expect(find.text(strings.text('helpdeskCachedNotice')), findsOneWidget);
      expect(find.text('Water leak'), findsOneWidget);
      expect(find.text(strings.text('helpdeskEmpty')), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Failed initial Helpdesk load shows retry but no invented cached history', (tester) async {
    final repository = _RefreshHelpdeskRepository()..failLoad = true;
    final controller = ResidentDataController(
      repository, activeUnitId: 'unit-1', fetchEntitlements: false,
    )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
    addTearDown(controller.dispose);
    await tester.pumpWidget(MaterialApp(home: HelpdeskScreen(controller: controller)));
    await tester.pumpAndSettle();
    expect(find.text(AaraagateStrings.device().text('helpdeskLoadFailed')), findsOneWidget);
    expect(find.text('Water leak'), findsNothing);
    expect(find.text(AaraagateStrings.device().text('helpdeskCachedNotice')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Helpdesk does not retain previous property history after controller switch', (tester) async {
    final repository = _RefreshHelpdeskRepository();
    final first = ResidentDataController(
      repository, activeUnitId: 'unit-1', fetchEntitlements: false,
    )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
    final second = ResidentDataController(
      repository, activeUnitId: 'unit-2', fetchEntitlements: false,
    )..households = [{'id': 'house-2', 'unitId': 'unit-2'}];
    addTearDown(first.dispose);
    addTearDown(second.dispose);
    await tester.pumpWidget(MaterialApp(home: HelpdeskScreen(controller: first)));
    await tester.pumpAndSettle();
    expect(find.text('Water leak'), findsOneWidget);
    repository.failLoad = true;
    await tester.pumpWidget(MaterialApp(home: HelpdeskScreen(controller: second)));
    await tester.pumpAndSettle();
    expect(find.text('Water leak'), findsNothing);
    expect(find.text(AaraagateStrings.device().text('helpdeskCachedNotice')), findsNothing);
    expect(find.text(AaraagateStrings.device().text('helpdeskLoadFailed')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
