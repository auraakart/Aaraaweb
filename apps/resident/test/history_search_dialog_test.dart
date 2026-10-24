import 'package:aaraagate_resident/widgets/history_search_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main(){
  testWidgets('search submit and cancellation dispose only after the dialog unmounts',(tester) async {
    String? selected;
    await tester.pumpWidget(MaterialApp(home:Builder(builder:(context)=>Scaffold(body:TextButton(
      onPressed:() async {selected=await showDialog<String>(context:context,builder:(_)=>const HistorySearchDialog(initialQuery:'old'));},
      child:const Text('Open search'))))));
    await tester.tap(find.text('Open search'));await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'HD-2026-123');
    await tester.tap(find.widgetWithText(TextButton,'Search complaints'));await tester.pumpAndSettle();
    expect(selected,'HD-2026-123');expect(tester.takeException(),isNull);
    await tester.tap(find.text('Open search'));await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton,'Cancel'));await tester.pumpAndSettle();
    expect(selected,isNull);expect(tester.takeException(),isNull);
  });
}
