import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/screens/home_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:aaraagate_resident/widgets/premium_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  for (final code in <String>['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn']) {
    for (final dark in <bool>[false, true]) {
      testWidgets('Home actions use readable $code labels at 320dp: dark=$dark', (tester) async {
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(binding.platformDispatcher.clearLocaleTestValue);

        final controller = ResidentDataController(
          DemoResidentRepository(), activeUnitId: 'unit-a',
          fetchEntitlements: false,
        );
        addTearDown(controller.dispose);
        final opened = <String>[];
        final strings = AaraagateStrings.device();
        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
          home: Scaffold(body: HomeScreen(
            controller: controller,
            showGate: false, showStaff: true, showServices: false,
            showHelpdesk: true, showNotices: false, showBilling: true,
            showAmenities: true, showSos: false, showAi: false,
            onOpenStaff: () => opened.add('staff'),
            onOpenServices: () {}, onOpenHelpdesk: () => opened.add('helpdesk'),
            onOpenNotices: () {}, onOpenBilling: () => opened.add('billing'),
            onOpenAmenities: () => opened.add('amenities'),
            onOpenAi: (_) {},
          )),
        ));
        await tester.pumpAndSettle();

        expect(find.text(strings.text('homeQuickActions')), findsOneWidget);
        final actions = ['homeStaff', 'homeBilling', 'homeAmenities', 'homeHelpdesk'];
        for (final key in actions) {
          expect(strings.text(key), isNotEmpty);
          await tester.scrollUntilVisible(
            find.text(strings.text(key)), 120,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.pumpAndSettle();
          expect(find.text(strings.text(key)).hitTestable(), findsOneWidget);
        }
        final last = find.text(strings.text('homeHelpdesk'));
        await tester.tap(last);
        expect(opened, ['helpdesk']);
        final surfaces = tester.widgetList<PremiumSurface>(find.byType(PremiumSurface));
        expect(surfaces.where((surface) => surface.onTap != null).isNotEmpty, isTrue);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final code in <String>['hi', 'ta']) {
    testWidgets('Home localized actions wrap at 200% text: $code', (tester) async {
      tester.view.physicalSize = const Size(320, 760);
      tester.view.devicePixelRatio = 1;
      binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(binding.platformDispatcher.clearLocaleTestValue);
      final controller = ResidentDataController(
        DemoResidentRepository(), activeUnitId: 'unit-a',
        fetchEntitlements: false,
      );
      addTearDown(controller.dispose);
      final strings = AaraagateStrings.device();
      await tester.pumpWidget(MaterialApp(
        theme: AaraagateTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2), disableAnimations: true,
          ),
          child: child!,
        ),
        home: Scaffold(body: HomeScreen(
          controller: controller,
          showGate: false, showStaff: true, showServices: false,
          showHelpdesk: true, showNotices: false, showBilling: true,
          showAmenities: true, showSos: false, showAi: false,
          onOpenStaff: () {}, onOpenServices: () {}, onOpenHelpdesk: () {},
          onOpenNotices: () {}, onOpenBilling: () {},
          onOpenAmenities: () {}, onOpenAi: (_) {},
        )),
      ));
      await tester.pumpAndSettle();
      for (final key in ['homeStaff', 'homeBilling', 'homeAmenities', 'homeHelpdesk']) {
        await tester.scrollUntilVisible(
          find.text(strings.text(key)), 170,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(find.text(strings.text(key)), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
