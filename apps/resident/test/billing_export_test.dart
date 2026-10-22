import 'dart:async';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/widgets/billing_export.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:share_plus/share_plus.dart';

class ExportRepository extends ResidentRepository {
  ExportRepository():super(ApiClient(baseUrl:'http://127.0.0.1',accessToken:'test'));
  final pending=Completer<Map<String,dynamic>>();
  int calls=0;
  @override
  Future<Map<String,dynamic>> maintenanceStatement({required String unitId,required String from,required String to}) {calls++;return pending.future;}
  @override
  Future<void> recordJourney(String journey,String outcome,int durationMs,{int retryCount=0}) async {}
}

void main() {
  testWidgets('exports exact verified receipt data as a named CSV and handles share failure', (tester) async {
    final repository=ExportRepository();
    ShareParams? captured;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:BillingExportButton(repository:repository,
      receipt:const {'receiptNumber':'AGRP-full','amountPaise':12345,'status':'REFUNDED','societyName':'=formula'},
      share:(params) async {captured=params;throw StateError('Share unavailable');}))));
    await tester.tap(find.text('Save or share receipt'));await tester.pumpAndSettle();
    expect(captured!.fileNameOverrides,['Aaraagate-receipt.csv']);
    final contents=await captured!.files!.single.readAsString();
    expect(contents,contains('AGRP-full'));expect(contents,contains('REFUNDED'));expect(contents,contains("'=formula"));
    expect(find.textContaining('Could not export.'),findsOneWidget);
    expect(tester.takeException(),isNull);
  });
  testWidgets('stale receipt context cannot start sharing', (tester) async {
    var shares=0;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:BillingExportButton(repository:ExportRepository(),
      receipt:const {'receiptNumber':'old'},isCurrent:()=>false,
      share:(_) async {shares++;throw StateError('must not share');}))));
    await tester.tap(find.text('Save or share receipt'));await tester.pumpAndSettle();
    expect(shares,0);expect(tester.takeException(),isNull);
  });
  testWidgets('switching property while statement loads discards the old export', (tester) async {
    final repository=ExportRepository();var shares=0;
    Future<ShareResult> share(ShareParams params) async {shares++;throw StateError('must not share');}
    Widget view(String unit)=>MaterialApp(home:Scaffold(body:BillingExportButton(key:const ValueKey('export'),repository:repository,unitId:unit,share:share)));
    await tester.pumpWidget(view('unit-one'));
    await tester.tap(find.text('Export maintenance statement'));await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));await tester.pumpAndSettle();
    expect(repository.calls,1);
    await tester.pumpWidget(view('unit-two'));await tester.pump();
    repository.pending.complete({'invoices':[], 'payments':[]});await tester.pumpAndSettle();
    expect(shares,0);expect(tester.takeException(),isNull);
  });
}
