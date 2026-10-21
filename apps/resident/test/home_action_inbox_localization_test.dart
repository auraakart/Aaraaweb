import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/screens/home_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  for (final code in <String>['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn']) {
    for (final dark in <bool>[false, true]) {
      testWidgets('Home action inbox and gate history are localized: $code dark=$dark', (tester) async {
        tester.view.physicalSize = const Size(320, 850);
        tester.view.devicePixelRatio = 1;
        binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(binding.platformDispatcher.clearLocaleTestValue);
        final strings = AaraagateStrings.device();
        final controller = ResidentDataController(
          DemoResidentRepository(), activeUnitId: 'unit-a',
          fetchEntitlements: false,
        )..accessRequests = [
          {'id': 'arrival-1', 'subjectName': 'Visitor at gate',
            'subjectType': 'VISITOR', 'status': 'PENDING'}
        ];
        addTearDown(controller.dispose);
        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
          home: Scaffold(body: HomeScreen(
            controller: controller,
            showGate: true, showStaff: false, showServices: false,
            showHelpdesk: false, showNotices: false, showBilling: false,
            showAmenities: false, showSos: false, showAi: false,
            onOpenStaff: () {}, onOpenServices: () {}, onOpenHelpdesk: () {},
            onOpenNotices: () {}, onOpenBilling: () {},
            onOpenAmenities: () {}, onOpenAi: (_) {},
          )),
        ));
        await tester.pumpAndSettle();

        expect(find.text(strings.text('homeActionInbox')), findsOneWidget);
        expect(find.text(strings.text('homeAttentionOne')), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text(strings.text('homeRecentGate')), 170,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(find.text(strings.text('homeRecentGate')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final code in <String>['en', 'ta']) {
    testWidgets('Home failed refresh keeps localized gate warning at 200%: $code', (tester) async {
      tester.view.physicalSize = const Size(320, 850);
      tester.view.devicePixelRatio = 1;
      binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(binding.platformDispatcher.clearLocaleTestValue);
      final strings = AaraagateStrings.device();
      final controller = ResidentDataController(
        DemoResidentRepository(), activeUnitId: 'unit-a',
        fetchEntitlements: false,
      )..accessError = 'Network unavailable';
      addTearDown(controller.dispose);
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
          showGate: true, showStaff: false, showServices: false,
          showHelpdesk: false, showNotices: false, showBilling: false,
          showAmenities: false, showSos: false, showAi: false,
          onOpenStaff: () {}, onOpenServices: () {}, onOpenHelpdesk: () {},
          onOpenNotices: () {}, onOpenBilling: () {},
          onOpenAmenities: () {}, onOpenAi: (_) {},
        )),
      ));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text(strings.text('homeGateError')), 150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text(strings.text('homeGateError')), findsOneWidget);
      expect(find.text(strings.text('retry')), findsOneWidget);
      expect(find.text(strings.text('homeAttentionClear')), findsOneWidget);
      expect(find.text('All clear — nothing needs approval right now.'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
