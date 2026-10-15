import 'package:aaraagate_resident/widgets/service_booking_lifecycle.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps backend booking states to resident-friendly labels', () {
    expect(ServiceBookingLifecycle.labelFor('REQUESTED'), 'Requested');
    expect(ServiceBookingLifecycle.labelFor('CONFIRMED'), 'Confirmed');
    expect(ServiceBookingLifecycle.labelFor('IN_PROGRESS'), 'Service started');
    expect(ServiceBookingLifecycle.labelFor('COMPLETED'), 'Completed');
    expect(ServiceBookingLifecycle.labelFor('CANCELLED'), 'Cancelled');
  });

  test('explains when cancellation is and is not available', () {
    expect(ServiceBookingLifecycle.cancellationGuidance('REQUESTED'), contains('cancel'));
    expect(ServiceBookingLifecycle.cancellationGuidance('CONFIRMED'), contains('before the service starts'));
    expect(ServiceBookingLifecycle.cancellationGuidance('IN_PROGRESS'), contains('no longer available'));
    expect(ServiceBookingLifecycle.cancellationGuidance('COMPLETED'), contains('no longer be cancelled'));
  });

  testWidgets('renders friendly service-started progress', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ServiceBookingLifecycle(status: 'IN_PROGRESS'),
        ),
      ),
    );

    expect(find.text('Requested'), findsOneWidget);
    expect(find.text('Confirmed'), findsOneWidget);
    expect(find.text('Service started'), findsOneWidget);
    expect(find.text('Completed'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle_rounded), findsNWidgets(3));
    expect(find.byIcon(Icons.radio_button_unchecked_rounded), findsOneWidget);
  });

  testWidgets('renders cancelled state without active progress', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ServiceBookingLifecycle(status: 'CANCELLED'),
        ),
      ),
    );

    expect(find.text('Cancelled'), findsOneWidget);
    expect(find.byIcon(Icons.cancel_outlined), findsOneWidget);
  });
}
