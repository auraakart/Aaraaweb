import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/home_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Action inbox shows one aggregate count and keeps urgency on the item only', (tester) async {
    await tester.binding.setSurfaceSize(const Size(700, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'unit-a',
      fetchEntitlements: false,
    )
      ..accessRequests = [
        {
          'id': 'visit-1',
          'subjectName': 'Amit Verma',
          'subjectType': 'VISITOR',
          'purpose': 'Family visit',
          'status': 'PENDING',
        },
      ]
      ..helpdeskTickets = [
        {
          'id': 'ticket-1',
          'title': 'Water seepage near kitchen',
          'status': 'OPEN',
          'priority': 'HIGH',
          'updatedAt': '2026-09-24T08:00:00.000Z',
        },
      ];

    await tester.pumpWidget(
      MaterialApp(
        theme: AaraagateTheme.light(),
        home: Scaffold(
          body: HomeScreen(
            controller: controller,
            showGate: true,
            showStaff: true,
            showServices: true,
            showHelpdesk: true,
            showNotices: false,
            showBilling: false,
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
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Action inbox'), findsOneWidget);
    expect(find.text('2 items need your attention.'), findsOneWidget);
    expect(find.textContaining('ACT NOW'), findsNothing);
    expect(find.textContaining('SOON 1'), findsNothing);
    expect(find.textContaining('INFO 0'), findsNothing);
    expect(find.text('Waiting'), findsOneWidget);
    expect(find.text('Soon'), findsOneWidget);

    final semantics = tester.widget<Semantics>(
      find.byWidgetPredicate(
        (widget) => widget is Semantics && widget.properties.label == 'Action inbox. 2 items need your attention.',
      ),
    );
    expect(semantics.properties.liveRegion, isTrue);
    expect(
      find.byWidgetPredicate(
        (widget) => widget is Semantics && widget.properties.label == 'Soon. Water seepage near kitchen. High priority · action in progress. Open helpdesk',
      ),
      findsOneWidget,
    );
  });
}
