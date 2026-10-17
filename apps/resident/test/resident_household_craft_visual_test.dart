import 'package:aaraagate_resident/data/demo_household_state.dart';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/emergency_contacts_screen.dart';
import 'package:aaraagate_resident/screens/vehicles_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/resident_visual_capture.dart';

const _contactName = 'Anand Krishnamurthy Ramanathan';
const _vehicleNumber = 'TN09AB123456789';
const _pendingVehicle = 'TN20XY987654321';

ResidentDataController _controller(String householdId) {
  final controller = ResidentDataController(
    DemoResidentRepository(),
    fetchEntitlements: false,
  )..households = [
      {
        'id': householdId,
        'accessPreferences': {
          'parkingSlots': {'vehicle-craft': 'Basement parking area B2 / allotted bay 18'},
        },
      },
    ];
  DemoHouseholdState.contactsFor(householdId)
    ..clear()
    ..add({
      'id': 'contact-craft',
      'name': _contactName,
      'phone': '+91 98765 42001',
      'relation': 'Trusted family emergency contact',
      'priority': 1,
    });
  DemoHouseholdState.vehiclesFor(householdId)
    ..clear()
    ..add({
      'id': 'vehicle-craft',
      'plateNumber': _vehicleNumber,
      'vehicleType': 'CAR',
      'make': 'Maruti Suzuki',
      'model': 'Grand Vitara Hybrid',
      'color': 'Pearl White',
    });
  DemoHouseholdState.pendingFor(householdId)
    ..clear()
    ..add({
      'id': 'pending-vehicle-craft',
      'status': 'PENDING',
      'type': 'VEHICLE_REMOVE',
      'payload': {'plateNumber': _pendingVehicle},
    });
  return controller;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadSdkFonts);

  for (final dark in [false, true]) {
    for (final size in [(320.0, 844.0, 2.0), (390.0, 844.0, 1.0)]) {
      for (final kind in ['contacts', 'vehicles']) {
        testWidgets('household craft $kind dark=$dark width=${size.$1} scale=${size.$3}', (tester) async {
          tester.view.physicalSize = Size(size.$1, size.$2);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          final householdId = 'demo-household-craft-${dark ? 'dark' : 'light'}-${size.$1.toInt()}-$kind';
          final controller = _controller(householdId);
          addTearDown(controller.dispose);
          final boundary = GlobalKey();
          final page = kind == 'contacts'
              ? EmergencyContactsScreen(controller: controller, householdId: householdId)
              : VehiclesScreen(controller: controller, householdId: householdId);

          await tester.pumpWidget(RepaintBoundary(
            key: boundary,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: captureTheme(dark),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(size.$3),
                  disableAnimations: true,
                ),
                child: child!,
              ),
              home: page,
            ),
          ));
          await tester.pumpAndSettle();
          if (kind == 'contacts') {
            await tester.ensureVisible(find.text(_contactName));
            await tester.pumpAndSettle();
            final title = tester.renderObject<RenderParagraph>(find.text(_contactName));
            expect(title.maxLines, isNull);
            expect(find.text('Primary'), findsOneWidget);
            expect(find.byTooltip('Remove contact'), findsOneWidget);
            expect(find.textContaining('Adding a contact does not grant society membership'), findsOneWidget);
          } else {
            await tester.ensureVisible(find.text(_pendingVehicle));
            await tester.pumpAndSettle();
            expect(find.text('Pending'), findsOneWidget);
            final pending = tester.renderObject<RenderParagraph>(find.text(_pendingVehicle));
            expect(pending.maxLines, isNull);
            await tester.scrollUntilVisible(
              find.text(_vehicleNumber),
              220,
              scrollable: find.byType(Scrollable).first,
            );
            await tester.ensureVisible(find.text(_vehicleNumber));
            await tester.pumpAndSettle();
            final plate = tester.renderObject<RenderParagraph>(find.text(_vehicleNumber));
            expect(plate.maxLines, isNull);
            expect(find.byTooltip('Request vehicle removal'), findsOneWidget);
          }
          expect(tester.takeException(), isNull);
          await captureResidentScreen(
            tester,
            boundary,
            'craft-household-$kind-${dark ? 'dark' : 'light'}-${size.$1.toInt()}-${size.$3}',
          );
        });
      }
    }
  }

  for (final kind in ['contacts', 'vehicles']) {
    testWidgets('household $kind add form stays scrollable at 320px and 200% type', (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final householdId = 'demo-household-form-$kind';
      final controller = _controller(householdId);
      addTearDown(controller.dispose);
      await tester.pumpWidget(MaterialApp(
        theme: captureTheme(false),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2),
            viewInsets: const EdgeInsets.only(bottom: 220),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: kind == 'contacts'
            ? EmergencyContactsScreen(controller: controller, householdId: householdId)
            : VehiclesScreen(controller: controller, householdId: householdId),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text(kind == 'contacts' ? 'Add contact' : 'Add vehicle'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.byType(SingleChildScrollView), findsWidgets);
      if (kind == 'contacts') {
        expect(tester.widget<DropdownButton<int>>(find.byType(DropdownButton<int>)).isExpanded, isTrue);
        expect(find.text('Save contact'), findsOneWidget);
      } else {
        expect(tester.widget<DropdownButton<String>>(find.byType(DropdownButton<String>)).isExpanded, isTrue);
        expect(find.text('Submit for approval'), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
