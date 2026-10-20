import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/screens/helpdesk_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _EmptyRepository extends DemoResidentRepository {
  @override
  Future<List<Map<String, dynamic>>> helpdeskTickets() async => const [];
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  for (final code in <String>['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn']) {
    testWidgets('localized Helpdesk form fields and validation: $code', (tester) async {
      tester.view.physicalSize = const Size(390, 860);
      tester.view.devicePixelRatio = 1;
      binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(binding.platformDispatcher.clearLocaleTestValue);
      final controller = ResidentDataController(
        _EmptyRepository(), activeUnitId: 'unit-1',
        fetchEntitlements: false,
      )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
      addTearDown(controller.dispose);
      final strings = AaraagateStrings.device();
      await tester.pumpWidget(MaterialApp(
        home: HelpdeskScreen(controller: controller),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, strings.text('helpdeskNewComplaint')));
      await tester.pumpAndSettle();
      expect(find.text(strings.text('helpdeskFormIntro')), findsOneWidget);
      expect(find.widgetWithText(TextField, strings.text('helpdeskIssueTitle')), findsOneWidget);
      expect(find.widgetWithText(TextField, strings.text('helpdeskDescription')), findsOneWidget);
      expect(find.widgetWithText(TextField, strings.text('helpdeskCategory')), findsOneWidget);
      expect(find.text(strings.text('helpdeskTitleHint')), findsOneWidget);
      expect(find.text(strings.text('helpdeskDescriptionHint')), findsOneWidget);
      final field = tester.widget<DropdownButtonFormField<String>>(find.byType(DropdownButtonFormField<String>));
      expect(field.initialValue, 'NORMAL');
      await tester.scrollUntilVisible(
        find.text(strings.text('helpdeskSubmit')), 170,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text(strings.text('helpdeskSubmit')));
      await tester.pumpAndSettle();
      expect(find.text(strings.text('helpdeskValidation')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  for (final code in <String>['hi', 'ta']) {
    testWidgets('Helpdesk localized fields remain readable at 320dp / 200%: $code', (tester) async {
      tester.view.physicalSize = const Size(320, 840);
      tester.view.devicePixelRatio = 1;
      binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(binding.platformDispatcher.clearLocaleTestValue);
      final controller = ResidentDataController(
        _EmptyRepository(), activeUnitId: 'unit-1',
        fetchEntitlements: false,
      )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
      addTearDown(controller.dispose);
      final strings = AaraagateStrings.device();
      await tester.pumpWidget(MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2), disableAnimations: true,
          ),
          child: child!,
        ),
        home: HelpdeskScreen(controller: controller),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, strings.text('helpdeskNewComplaint')));
      await tester.pumpAndSettle();
      expect(find.text(strings.text('helpdeskIssueTitle')), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text(strings.text('helpdeskSubmit')), 170,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      expect(find.text(strings.text('helpdeskSubmit')).hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
