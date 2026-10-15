import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/screens/community_circles_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';

void main() {
  testWidgets('joined members see sender identities and can report a message', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CommunityCirclesScreen(repository: DemoResidentRepository())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OPEN CIRCLE'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Arun Kumar · A · 204'), findsOneWidget);
    expect(find.textContaining('You (Priya Sharma) · Maple Tower · A-1204'), findsOneWidget);
    await tester.tap(find.byTooltip('Report message').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Inappropriate content');
    await tester.tap(find.text('Send report'));
    await tester.pumpAndSettle();
    expect(find.text('Report sent to the society managers for review.'), findsOneWidget);
  });
  testWidgets('resident requests show pending rather than publishing immediately', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CommunityCirclesScreen(repository: DemoResidentRepository())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Request a circle'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Walking neighbours');
    await tester.tap(find.text('Submit request'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Walking neighbours'), findsOneWidget);
    expect(find.text('PENDING'), findsOneWidget);
  });
  testWidgets('circle composer stays reachable with keyboard and 200% text', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final repository = DemoResidentRepository();
    await tester.pumpWidget(MaterialApp(
      theme: AaraagateTheme.light(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: const TextScaler.linear(2),
          viewInsets: const EdgeInsets.only(bottom: 280),
        ), child: child!,
      ),
      home: CommunityCirclesScreen(repository: repository),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('OPEN CIRCLE'), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('OPEN CIRCLE'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OPEN CIRCLE'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Keyboard accessibility check');
    await tester.ensureVisible(find.text('POST'));
    await tester.pumpAndSettle();
    expect(find.text('POST').hitTestable(), findsOneWidget);
    await tester.tap(find.text('POST'));
    await tester.pumpAndSettle();
    expect((await repository.communityCirclePosts('demo-circle-1')).last['body'], 'Keyboard accessibility check');
    expect(tester.takeException(), isNull);
  });

}
