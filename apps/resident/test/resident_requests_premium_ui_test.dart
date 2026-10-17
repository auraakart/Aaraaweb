import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/resident_requests_screen.dart';
import 'package:aaraagate_resident/widgets/premium_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/resident_visual_capture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadSdkFonts);

  const description =
      'A signed address proof letter is required for the apartment registration '
      'appointment next Friday. Please include the complete unit and society address '
      'along with the applicant name in the society-issued document.';

  for (final dark in [false, true]) {
    testWidgets('resident request details remain readable at 320px and 200% text, dark=$dark', (tester) async {
      tester.view.physicalSize = const Size(320, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = ResidentDataController(
        DemoResidentRepository(),
        activeUnitId: 'demo-unit-1',
        fetchEntitlements: false,
      )..helpdeskTickets = [
          {
            'id': 'request-long',
            'unitId': 'demo-unit-1',
            'category': 'RESIDENT_REQUEST:ADDRESS_PROOF',
            'title': 'Address proof letter for apartment registration',
            'status': 'IN_REVIEW',
            'description': description,
          },
        ];
      addTearDown(controller.dispose);
      final boundary = GlobalKey();
      await tester.pumpWidget(RepaintBoundary(
        key: boundary,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: captureTheme(dark),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(2),
              disableAnimations: true,
            ),
            child: child!,
          ),
          home: Scaffold(body: ResidentRequestsScreen(controller: controller)),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Resident requests'), findsOneWidget);
      expect(find.text('New request'), findsOneWidget);
      expect(find.byType(PremiumPageIntro), findsOneWidget);
      expect(tester.widget<DropdownButtonFormField<String>>(
        find.byType(DropdownButtonFormField<String>),
      ).isExpanded, isTrue);
      await tester.scrollUntilVisible(
        find.text(description),
        240,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text(description));
      await tester.pumpAndSettle();
      final rendered = tester.renderObject<RenderParagraph>(find.text(description));
      expect(rendered.maxLines, isNull);
      expect(rendered.overflow, TextOverflow.clip);
      expect(find.text('IN REVIEW'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await captureResidentScreen(
        tester,
        boundary,
        'resident-requests-${dark ? 'dark' : 'light'}-320-large-text',
      );
    });
  }
}
