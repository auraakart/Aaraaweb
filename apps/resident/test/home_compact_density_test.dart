import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/home_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:aaraagate_resident/widgets/premium_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  for (final dark in <bool>[false, true]) {
    testWidgets('compact Home keeps four useful actions in one row and tappable: dark=$dark', (tester) async {
      tester.view.physicalSize = const Size(320, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final controller = ResidentDataController(
        DemoResidentRepository(),
        activeUnitId: 'unit-a',
        fetchEntitlements: false,
      )..accessRequests = [
        {'id': 'delivery-1', 'subjectName': 'Swiggy rider', 'subjectType': 'DELIVERY', 'status': 'PENDING'},
      ];
      addTearDown(controller.dispose);
      final opened = <String>[];
      await tester.pumpWidget(MaterialApp(
        theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
        home: Scaffold(body: HomeScreen(
          controller: controller,
          showGate: true,
          showStaff: true,
          showServices: true,
          showHelpdesk: true,
          showNotices: true,
          showBilling: true,
          showAmenities: true,
          showSos: false,
          showAi: true,
          onOpenStaff: () => opened.add('Staff'),
          onOpenServices: () {},
          onOpenHelpdesk: () => opened.add('Helpdesk'),
          onOpenNotices: () {},
          onOpenBilling: () => opened.add('Billing'),
          onOpenAmenities: () => opened.add('Amenities'),
          onOpenAi: (_) => opened.add('Assistant'),
        )),
      ));
      await tester.pumpAndSettle();

      final labels = ['Staff', 'Billing', 'Amenities', 'Helpdesk'];
      final y = labels.map((label) => tester.getTopLeft(find.text(label)).dy).toList();
      for (final top in y.skip(1)) {
        expect((top - y.first).abs(), lessThan(2));
      }
      for (final label in labels) {
        final tile = find.ancestor(
          of: find.text(label),
          matching: find.byType(PremiumSurface),
        ).first;
        expect(tester.getSize(tile).height, greaterThanOrEqualTo(48));
        expect(tester.getSize(tile).width, greaterThanOrEqualTo(48));
        await tester.tap(find.text(label));
        expect(opened.last, label);
      }
      expect(find.text('Action inbox'), findsOneWidget);
      expect(find.text('No community updates right now.'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Home keeps accessible quick actions and full assistant context at 200% scale', (tester) async {
    tester.view.physicalSize = const Size(320, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'unit-a',
      fetchEntitlements: false,
    );
    addTearDown(controller.dispose);

    await tester.pumpWidget(MaterialApp(
      theme: AaraagateTheme.light(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: const TextScaler.linear(2),
          disableAnimations: true,
        ),
        child: child!,
      ),
      home: Scaffold(body: HomeScreen(
        controller: controller,
        showGate: true,
        showStaff: true,
        showServices: true,
        showHelpdesk: true,
        showNotices: false,
        showBilling: true,
        showAmenities: true,
        showSos: false,
        showAi: true,
        onOpenStaff: () {},
        onOpenServices: () {},
        onOpenHelpdesk: () {},
        onOpenNotices: () {},
        onOpenBilling: () {},
        onOpenAmenities: () {},
        onOpenAi: (_) {},
      )),
    ));
    await tester.pumpAndSettle();
    final assistant = tester.widget<Text>(find.text('Ask about dues, staff, services, amenities or society updates.'));
    expect(assistant.maxLines, isNull);
    await tester.scrollUntilVisible(
      find.text('Helpdesk'),
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Helpdesk').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
