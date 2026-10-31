import 'package:aaraagate_resident/data/demo_household_state.dart';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/emergency_contacts_screen.dart';
import 'package:aaraagate_resident/screens/vehicles_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/resident_visual_capture.dart';

ResidentDataController controller(String householdId) => ResidentDataController(
  DemoResidentRepository(), activeUnitId: 'demo-unit-1', fetchEntitlements: false,
)..households = [{'id': householdId, 'vehicles': <Map<String, dynamic>>[]}];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadSdkFonts);

  for (final dark in [false, true]) {
    for (final vehicle in [false, true]) {
      testWidgets('household form fits 320px, 200% text and keyboard, vehicle=$vehicle dark=$dark', (tester) async {
        tester.view.physicalSize = const Size(320, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final id = 'demo-v511-${vehicle ? 'vehicle' : 'contact'}-$dark';
        final data = controller(id);
        addTearDown(data.dispose);
        final boundary = GlobalKey();
        await tester.pumpWidget(RepaintBoundary(key: boundary, child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: captureTheme(dark),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(2), viewInsets: const EdgeInsets.only(bottom: 280), disableAnimations: true),
            child: child!,
          ),
          home: vehicle ? VehiclesScreen(controller: data, householdId: id) : EmergencyContactsScreen(controller: data, householdId: id),
        )));
        await tester.pumpAndSettle();
        await tester.tap(find.text(vehicle ? 'Add vehicle' : 'Add contact'));
        await tester.pumpAndSettle();
        final end = vehicle ? find.widgetWithText(TextField, 'Colour') : find.byType(DropdownButtonFormField<int>);
        final scrollable = find.descendant(of: find.byType(AlertDialog), matching: find.byType(Scrollable)).first;
        await tester.scrollUntilVisible(end, 120, scrollable: scrollable);
        await tester.ensureVisible(end);
        await tester.pumpAndSettle();
        expect(end.hitTestable(), findsOneWidget);
        final label = tester.renderObject<RenderParagraph>(find.text(vehicle ? 'Colour' : 'Relationship'));
        expect(label.didExceedMaxLines, isFalse);
        expect(find.text(vehicle ? 'Submit for approval' : 'Save contact').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        await captureResidentScreen(tester, boundary, 'v511-household-${vehicle ? 'vehicle' : 'contact'}-${dark ? 'dark' : 'light'}-320-large-keyboard');
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsNothing);
        expect(tester.takeException(), isNull);
        expect(DemoHouseholdState.pendingFor(id), isEmpty);
      });
    }
  }

  for (final cancel in [true, false]) {
    testWidgets('focused vehicle input survives ${cancel ? 'Cancel' : 'system Back'} dismissal', (tester) async {
      final id = 'demo-v511-dismiss-$cancel';
      final data = controller(id);
      addTearDown(data.dispose);
      await tester.pumpWidget(MaterialApp(home: VehiclesScreen(controller: data, householdId: id)));
      await tester.tap(find.text('Add vehicle'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Registration number'), 'TN01AB1234');
      if (cancel) { await tester.tap(find.text('Cancel')); } else { expect(await tester.binding.handlePopRoute(), isTrue); }
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(tester.takeException(), isNull);
      expect(DemoHouseholdState.pendingFor(id), isEmpty);
    });
  }

  testWidgets('vehicle validation keeps the draft and submission still requires society approval', (tester) async {
    const id = 'demo-v511-submit';
    final data = controller(id);
    addTearDown(data.dispose);
    await tester.pumpWidget(MaterialApp(home: VehiclesScreen(controller: data, householdId: id)));
    await tester.tap(find.text('Add vehicle'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit for approval'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a registration number.'), findsOneWidget);
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Registration number'), ' tn 01-ab 1234 ');
    await tester.tap(find.text('Submit for approval'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(DemoHouseholdState.pendingFor(id), hasLength(1));
    expect(DemoHouseholdState.pendingFor(id).single, containsPair('status', 'PENDING'));
    expect(DemoHouseholdState.pendingFor(id).single['payload'], containsPair('plateNumber', 'TN01AB1234'));
    expect(DemoHouseholdState.vehiclesFor(id), isEmpty);
  });
}
