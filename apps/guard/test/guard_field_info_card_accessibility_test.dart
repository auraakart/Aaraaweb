import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_info_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      for (final incident in <bool>[false, true]) {
        testWidgets(
          'Guard info card is readable dark=$dark scale=$scale incident=$incident',
          (tester) async {
            tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);

            final heading = incident
                ? 'CRITICAL · Fire safety incident at the North entrance'
                : 'DENY · Krishnamurthy Ramanathan Visitor';
            final detail = incident
                ? 'SECURITY · OPEN · 3 evidence references available'
                : 'Security review required before entry at this gate';

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
                body: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: GuardFieldInfoCard(
                      title: heading,
                      subtitle: detail,
                      icon: incident
                          ? Icons.warning_amber_rounded
                          : Icons.block_rounded,
                    ),
                  ),
                ),
              ),
            ));
            await tester.pumpAndSettle();

            final title = find.text(heading);
            final subtitle = find.text(detail);
            expect(title, findsOneWidget);
            expect(subtitle, findsOneWidget);
            expect(find.byType(Icon), findsWidgets);
            if (scale == 2) {
              expect(find.byType(ListTile), findsNothing);
              expect(
                tester.getTopLeft(subtitle).dy,
                greaterThan(tester.getBottomLeft(title).dy),
              );
              expect(
                tester.getTopLeft(subtitle).dx,
                lessThan(tester.getTopLeft(title).dx),
              );
            } else {
              expect(find.byType(ListTile), findsOneWidget);
            }
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}
