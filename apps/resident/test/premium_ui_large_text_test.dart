import 'package:aaraagate_resident/widgets/premium_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('premium section header stacks trailing content for large text', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(3.0)),
          child: const Scaffold(
            body: Padding(
              padding: EdgeInsets.all(16),
              child: PremiumSectionHeader(
                title: 'A deliberately long resident section title',
                supportingText: 'Supporting copy should remain readable without being squeezed by the trailing status.',
                trailing: AaraagateStatusPill(label: '12 waiting'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('A deliberately long resident section title'), findsOneWidget);
    expect(find.text('12 waiting'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
