import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_attention_header.dart';
import 'package:aaraagate_guard/widgets/guard_operation_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final dark in <bool>[false, true]) {
    for (final urgent in <int>[0, 3]) {
      for (final scale in <double>[1, 2]) {
        testWidgets(
          'Attention header stays readable: dark=$dark urgent=$urgent scale=$scale',
          (tester) async {
            tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);

            await tester.pumpWidget(MaterialApp(
              theme: dark
                  ? AaraagateGuardTheme.dark()
                  : AaraagateGuardTheme.light(),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(scale),
                  disableAnimations: true,
                ),
                child: child!,
              ),
              home: Scaffold(
                body: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: GuardFieldAttentionHeader(urgent: urgent),
                  ),
                ),
              ),
            ));
            await tester.pumpAndSettle();

            final title = find.text(
              urgent == 0 ? 'Attention queue clear' : 'Attention now',
            );
            final pill = find.byType(GuardStatusPill);
            expect(title, findsOneWidget);
            expect(pill, findsOneWidget);
            expect(
              tester.widget<GuardStatusPill>(pill).label,
              urgent == 0 ? 'CLEAR' : '$urgent OPEN',
            );
            if (scale == 2) {
              expect(
                tester.getTopLeft(pill).dy,
                greaterThan(tester.getBottomLeft(title).dy),
              );
            } else {
              expect(
                tester.getTopLeft(pill).dy,
                lessThan(tester.getBottomLeft(title).dy),
              );
            }
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}
