import 'package:aaraagate_resident/widgets/service_booking_timeline_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('society service timeline shows gate evidence and warranty snapshot', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ServiceBookingTimelineSheet(
          timeline: {
            'booking': {
              'offering': {'name': 'AC service'},
              'provider': {'businessName': 'Trusted Services'},
            },
            'events': [
              {'action': 'BOOKING_REQUESTED', 'occurredAt': '2026-09-17T08:00:00Z'},
              {'action': 'PROVIDER_GATE_CHECKED_IN', 'occurredAt': '2026-09-17T09:00:00Z'},
              {'action': 'SERVICE_COMPLETED', 'occurredAt': '2026-09-17T10:00:00Z'},
            ],
            'warranty': {
              'warrantyDays': 30,
              'revisitPolicy': 'One free revisit',
              'warrantyUntil': '2026-10-17T10:00:00Z',
              'warrantyActive': true,
            },
          },
        ),
      ),
    ));

    expect(find.text('Service timeline'), findsOneWidget);
    expect(find.text('AC service · Trusted Services'), findsOneWidget);
    expect(find.text('Service warranty active'), findsOneWidget);
    expect(find.text('30 day warranty'), findsOneWidget);
    expect(find.text('One free revisit'), findsOneWidget);
    expect(find.text('Booking requested'), findsOneWidget);
    expect(find.text('Provider entered the society'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Service completed'), 250, scrollable: find.byType(Scrollable).first);
    expect(find.text('Service completed'), findsOneWidget);
  });
}
