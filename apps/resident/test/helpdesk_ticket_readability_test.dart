import 'package:aaraagate_resident/widgets/helpdesk_ticket_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/resident_visual_capture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadSdkFonts);
  for (final dark in [false, true]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('ticket reference and title remain readable dark=$dark scale=$scale', (tester) async {
        tester.view.physicalSize = const Size(320, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        const title = 'Parking sticker replacement';
        const number = 'HD-2026-000004';
        var opened = 0;
        final boundary = GlobalKey();
        await tester.pumpWidget(RepaintBoundary(key: boundary, child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: captureTheme(dark),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: Scaffold(body: SingleChildScrollView(child: Padding(
            padding: const EdgeInsets.all(16),
            child: HelpdeskTicketCard(ticket: const {
              'id': 'ticket-readable', 'title': title, 'ticketNumber': number,
              'status': 'CLOSED', 'priority': 'LOW',
            }, onTap: () { opened++; }),
          ))),
        )));
        await tester.pumpAndSettle();
        final reference = tester.renderObject<RenderParagraph>(find.text(number));
        expect(reference.getBoxesForSelection(TextSelection(baseOffset: 0, extentOffset: number.length)), hasLength(1));
        final heading = tester.renderObject<RenderParagraph>(find.text(title));
        expect(heading.getBoxesForSelection(TextSelection(baseOffset: title.indexOf('replacement'), extentOffset: title.length)), hasLength(1));
        expect(heading.didExceedMaxLines, isFalse);
        await tester.tap(find.text(title));
        await tester.pumpAndSettle();
        expect(opened, 1);
        expect(tester.takeException(), isNull);
        await captureResidentScreen(tester, boundary, 'v513-helpdesk-${dark ? 'dark' : 'light'}-320-$scale');
      });
    }
  }
}
