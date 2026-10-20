import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/screens/helpdesk_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _EmptyHelpdeskRepository extends DemoResidentRepository {
  @override
  Future<List<Map<String, dynamic>>> helpdeskTickets() async => const [];
}

class _FailedHelpdeskRepository extends DemoResidentRepository {
  @override
  Future<List<Map<String, dynamic>>> helpdeskTickets() async =>
      throw StateError('Connection unavailable');
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  for (final code in <String>['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn']) {
    for (final dark in <bool>[false, true]) {
      testWidgets('localized Helpdesk entry and complaint action at 320dp: $code dark=$dark', (tester) async {
        tester.view.physicalSize = const Size(320, 780);
        tester.view.devicePixelRatio = 1;
        binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(binding.platformDispatcher.clearLocaleTestValue);
        final strings = AaraagateStrings.device();
        final controller = ResidentDataController(
          _EmptyHelpdeskRepository(),
          activeUnitId: 'unit-1',
          fetchEntitlements: false,
        )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
        addTearDown(controller.dispose);
        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
          home: HelpdeskScreen(controller: controller),
        ));
        await tester.pumpAndSettle();

        expect(find.text(strings.text('helpdeskPageTitle')), findsOneWidget);
        expect(find.text(strings.text('helpdeskYourComplaints')), findsOneWidget);
        expect(find.text(strings.text('helpdeskIntro')), findsOneWidget);
        expect(find.text(strings.text('helpdeskEmpty')), findsOneWidget);
        final actionLabel = strings.text('helpdeskNewComplaint');
        final action = find.widgetWithText(FilledButton, actionLabel);
        expect(action.hitTestable(), findsOneWidget);
        await tester.tap(action);
        await tester.pumpAndSettle();
        expect(find.text(actionLabel), findsWidgets);
        expect(find.text('Issue title'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final code in <String>['en', 'ta']) {
    testWidgets('Helpdesk recovery is localized and safe at 320dp / 200%: $code', (tester) async {
      tester.view.physicalSize = const Size(320, 820);
      tester.view.devicePixelRatio = 1;
      binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(binding.platformDispatcher.clearLocaleTestValue);
      final controller = ResidentDataController(
        _FailedHelpdeskRepository(),
        activeUnitId: 'unit-1',
        fetchEntitlements: false,
      )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
      addTearDown(controller.dispose);
      final strings = AaraagateStrings.device();
      await tester.pumpWidget(MaterialApp(
        theme: AaraagateTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: HelpdeskScreen(controller: controller),
      ));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text(strings.text('helpdeskLoadFailed')), 160,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text(strings.text('helpdeskLoadFailed')), findsOneWidget);
      expect(find.text(strings.text('helpdeskRetry')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
