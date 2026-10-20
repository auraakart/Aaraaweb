import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/screens/workforce_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

ResidentDataController _controller({bool populated = false}) {
  return ResidentDataController(
    DemoResidentRepository(), activeUnitId: 'demo-unit-1',
    fetchEntitlements: false,
  )
    ..households = [{'id': 'demo-household-1', 'unitId': 'demo-unit-1'}]
    ..workforceAssignments = populated ? [{
      'id': 'demo-workforce-1', 'status': 'PENDING',
      'worker': <String, dynamic>{},
    }] : [];
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> mount(WidgetTester tester, ResidentDataController controller,
      String code, bool dark, double scale) async {
    tester.view.physicalSize = const Size(320, 840);
    tester.view.devicePixelRatio = 1;
    binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(binding.platformDispatcher.clearLocaleTestValue);
    await tester.pumpWidget(MaterialApp(
      theme: ThemeData(brightness: dark ? Brightness.dark : Brightness.light),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(scale), disableAnimations: true,
        ), child: child!,
      ),
      home: Scaffold(body: WorkforceScreen(controller: controller)),
    ));
    await tester.pumpAndSettle();
  }

  for (final code in ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn']) {
    for (final dark in [false, true]) {
      testWidgets('Staff entry and empty guidance at 320dp: $code dark=$dark', (tester) async {
        final controller = _controller();
        addTearDown(controller.dispose);
        await mount(tester, controller, code, dark, 1);
        final strings = AaraagateStrings.device();
        expect(find.text(strings.text('staffTitle')), findsOneWidget);
        expect(find.text(strings.text('staffIntro')), findsOneWidget);
        expect(find.byTooltip(strings.text('staffAdd')), findsOneWidget);
        expect(find.byTooltip(strings.text('staffRefresh')), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text(strings.text('staffEmptyMessage')), 120,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text(strings.text('staffEmptyTitle')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('Staff identity fallback and attendance destination: $code dark=$dark', (tester) async {
        final controller = _controller(populated: true);
        addTearDown(controller.dispose);
        await mount(tester, controller, code, dark, 1);
        final strings = AaraagateStrings.device();
        await tester.scrollUntilVisible(
          find.text(strings.text('staffNameUnavailable')), 100,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text(strings.text('staffRoleUnspecified')), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text(strings.text('staffAttendance')), 160,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text(strings.text('staffPayments')), findsOneWidget);
        await tester.tap(find.text(strings.text('staffAttendance')));
        await tester.pumpAndSettle();
        // The existing monthly register remains the destination, with no new action.
        expect(find.byKey(const ValueKey('attendance-month-selector')), findsOneWidget);
        expect(find.text('Attendance register'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final code in ['hi', 'ta']) {
    for (final dark in [false, true]) {
      testWidgets('Staff attendance remains reachable at 320dp / 200%: $code dark=$dark', (tester) async {
        final controller = _controller(populated: true);
        addTearDown(controller.dispose);
        await mount(tester, controller, code, dark, 2);
        final strings = AaraagateStrings.device();
        final attendance = find.widgetWithText(OutlinedButton, strings.text('staffAttendance'));
        await tester.scrollUntilVisible(
          attendance, 180,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.ensureVisible(attendance);
        await tester.pumpAndSettle();
        expect(attendance.hitTestable(), findsOneWidget);
        await tester.tap(attendance);
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('attendance-month-selector')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('unsupported Staff locale falls back to English', (tester) async {
    final controller = _controller();
    addTearDown(controller.dispose);
    await mount(tester, controller, 'fr', false, 1);
    expect(AaraagateStrings.device().languageCode, 'en');
    expect(find.text('Household staff'), findsOneWidget);
    expect(find.byTooltip('Refresh staff'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
